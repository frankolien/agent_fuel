// Agent Fuel example: a trading bot that pays a DIFFERENT registered
// service per request type — price quote, swap route, RPC submit — and
// settles each call against the matching service in one place.
//
// What this teaches that pyth_logger doesn't: how to structure a bot
// that depends on multiple paid services, where each request type maps
// to a different service keypair. The Router type owns the mapping;
// the main loop just asks for what it needs.
//
//   cargo run -p agent_fuel_runtime --example jupiter_router -- \
//     --agent-key            ~/.config/solana/agent.json \
//     --owner                <OWNER_WALLET_B58> \
//     --pyth-service-key     ~/.config/solana/svc-pyth.json \
//     --jupiter-service-key  ~/.config/solana/svc-jupiter.json \
//     --helius-service-key   ~/.config/solana/svc-helius.json
//
// Each service must already be registered on chain (see
// `agent-runtime register-service`) and hold ~0.05 SOL for the
// per-call receipt PDA rent. The bot loops every interval; one loop
// iteration = one full trading cycle = three paid calls.

use std::collections::HashMap;
use std::path::PathBuf;
use std::str::FromStr;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use agent_fuel_runtime::{load_keypair, Spender};
use anyhow::{anyhow, Context, Result};
use clap::Parser;
use sha2::{Digest, Sha256};
use solana_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::{Keypair, Signer};

#[derive(Parser, Debug)]
#[command(
    name = "jupiter-router",
    about = "Pays a different service per request type — price, route, submit.",
    version
)]
struct Args {
    #[arg(long, env = "AF_AGENT_KEY")]
    agent_key: PathBuf,

    #[arg(long, env = "AF_OWNER")]
    owner: String,

    /// Service that prices the asset (e.g. Pyth). Paid per price query.
    #[arg(long = "pyth-service-key", env = "AF_PYTH_KEY")]
    pyth_service_key: PathBuf,

    /// Service that computes the best swap route (e.g. Jupiter). Paid
    /// per route call.
    #[arg(long = "jupiter-service-key", env = "AF_JUPITER_KEY")]
    jupiter_service_key: PathBuf,

    /// Service that submits the swap tx (e.g. Helius RPC). Paid per
    /// submission.
    #[arg(long = "helius-service-key", env = "AF_HELIUS_KEY")]
    helius_service_key: PathBuf,

    /// Seconds between trading cycles.
    #[arg(long, default_value_t = 30)]
    interval_secs: u64,

    /// Per-call pricing in USDC. Default leaves a generous buffer for
    /// the demo; tune per real service contract.
    #[arg(long, default_value_t = 0.001)]
    price_cost: f64,
    #[arg(long, default_value_t = 0.01)]
    route_cost: f64,
    #[arg(long, default_value_t = 0.005)]
    submit_cost: f64,

    #[arg(
        long,
        env = "AF_USDC_MINT",
        default_value = "EMm5UveNWJaTfbMcJ8g2w7i2riydKKyZWhauEj8DzRTq"
    )]
    usdc_mint: String,

    #[arg(
        long,
        env = "AF_CREDIT_VAULT_PROGRAM",
        default_value = "EsykPsafhHUeN7jA9DGqBiGuBsTBaFynLDVVpE4jFXDg"
    )]
    credit_vault_program: String,

    #[arg(
        long,
        env = "AF_REPUTATION_PROGRAM",
        default_value = "4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ"
    )]
    reputation_program: String,

    #[arg(
        long,
        env = "AF_RPC_URL",
        default_value = "https://api.devnet.solana.com"
    )]
    rpc_url: String,
}

#[derive(Debug, Clone, Copy, Hash, Eq, PartialEq)]
enum ServiceKind {
    Price,
    Route,
    Submit,
}

impl ServiceKind {
    fn label(self) -> &'static str {
        match self {
            ServiceKind::Price => "price",
            ServiceKind::Route => "route",
            ServiceKind::Submit => "submit",
        }
    }
}

/// Router owns the (kind → keypair, amount) table and exposes a single
/// `call()` entry point. Adding a new service kind is one table row plus
/// one enum variant — main loop logic doesn't change.
struct Router {
    spender: Spender,
    services: HashMap<ServiceKind, (Keypair, u64)>,
}

impl Router {
    fn call(&self, kind: ServiceKind, request_id: u64) -> Result<()> {
        let (kp, amount) = self
            .services
            .get(&kind)
            .ok_or_else(|| anyhow!("no service wired for {kind:?}"))?;
        let receipt = build_receipt(
            &self.spender.agent.pubkey().to_string(),
            &kp.pubkey().to_string(),
            kind,
            request_id,
        );
        let sig = self.spender.pay(*amount, kp, receipt)?;
        tracing::info!(
            kind = kind.label(),
            service = %kp.pubkey(),
            amount = *amount,
            signature = %sig,
            "paid"
        );
        Ok(())
    }
}

fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .compact()
        .init();

    let args = Args::parse();
    let usdc_mint = Pubkey::from_str(&args.usdc_mint)
        .with_context(|| format!("invalid --usdc-mint: {}", args.usdc_mint))?;
    let program = Pubkey::from_str(&args.credit_vault_program)
        .with_context(|| format!("invalid --credit-vault-program: {}", args.credit_vault_program))?;
    let reputation_program = Pubkey::from_str(&args.reputation_program)
        .with_context(|| format!("invalid --reputation-program: {}", args.reputation_program))?;
    let owner = Pubkey::from_str(&args.owner)
        .with_context(|| format!("invalid --owner: {}", args.owner))?;

    let agent = load_keypair(&args.agent_key)?;
    let pyth = load_keypair(&args.pyth_service_key)?;
    let jupiter = load_keypair(&args.jupiter_service_key)?;
    let helius = load_keypair(&args.helius_service_key)?;

    let spender = Spender {
        agent,
        owner,
        usdc_mint,
        program,
        reputation_program,
        rpc: RpcClient::new_with_commitment(args.rpc_url.clone(), CommitmentConfig::confirmed()),
    };

    let mut services = HashMap::new();
    services.insert(ServiceKind::Price, (pyth, micro(args.price_cost)?));
    services.insert(ServiceKind::Route, (jupiter, micro(args.route_cost)?));
    services.insert(ServiceKind::Submit, (helius, micro(args.submit_cost)?));
    let router = Router { spender, services };

    tracing::info!(
        agent = %router.spender.agent.pubkey(),
        interval_secs = args.interval_secs,
        "starting jupiter-router — Ctrl-C to stop"
    );

    let mut cycle: u64 = 0;
    loop {
        cycle = cycle.wrapping_add(1);
        // Simulate one trading cycle: price → route → submit. In a real
        // bot each step would do actual work between calls (read the
        // price into the strategy, compose the swap, broadcast the tx).
        for kind in [ServiceKind::Price, ServiceKind::Route, ServiceKind::Submit] {
            if let Err(err) = router.call(kind, cycle) {
                tracing::error!(error = %err, cycle, kind = kind.label(), "call failed");
            }
        }
        thread::sleep(Duration::from_secs(args.interval_secs));
    }
}

fn micro(usdc: f64) -> Result<u64> {
    if usdc <= 0.0 {
        return Err(anyhow!("amount must be > 0 (got {usdc})"));
    }
    let m = (usdc * 1_000_000.0).round() as u64;
    if m == 0 {
        return Err(anyhow!("{usdc} USDC rounds to zero micro-USDC"));
    }
    Ok(m)
}

fn build_receipt(agent: &str, service: &str, kind: ServiceKind, request_id: u64) -> [u8; 32] {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let mut h = Sha256::new();
    h.update(agent.as_bytes());
    h.update(b"|");
    h.update(service.as_bytes());
    h.update(b"|");
    h.update(kind.label().as_bytes());
    h.update(b"|");
    h.update(request_id.to_le_bytes());
    h.update(b"|");
    h.update(now.to_le_bytes());
    let out = h.finalize();
    let mut buf = [0u8; 32];
    buf.copy_from_slice(&out);
    buf
}
