// Agent Fuel dogfood — minimal "trading bot" that polls Pyth BTC/USD
// every N seconds and pays a tiny per-tick fee to a service it's
// pretending to subscribe to. Run it for a day or a week; watch the
// vault balance tick down, the score climb, the alerts fire on the
// mobile app.
//
//   cargo run -p agent_fuel_runtime --example pyth_logger -- \
//     --agent-key   ~/.config/solana/agent.json \
//     --owner       <OWNER_WALLET_B58> \
//     --service-key ~/.config/solana/svc-pyth.json
//
// The service keypair must already be registered on chain (run
// `cargo run -p agent_fuel_runtime -- register-service` once first).
// Each tick atomically does credit_vault::spend + reputation::record_payment
// so the agent's volume + score actually accrue — without record_payment the
// backend mirror has nothing to count.
//
// Default cadence is 60s × $0.01 per tick = ~$15/day. Tune with
// --interval-secs and --amount-per-tick to match how much rope you want
// before the vault dries up. A $100 deposit holds about 7 days at the
// defaults.

use std::path::PathBuf;
use std::str::FromStr;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use agent_fuel_runtime::{load_keypair, Spender};
use anyhow::{anyhow, Context, Result};
use clap::Parser;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use solana_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Signer;

// BTC/USD price feed ID — same on every chain Hermes serves.
const BTC_USD_FEED: &str =
    "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
const HERMES_BASE: &str = "https://hermes.pyth.network/v2/updates/price/latest";

#[derive(Parser, Debug)]
#[command(
    name = "pyth-logger",
    about = "Long-running agent that pays a service per Pyth tick.",
    version
)]
struct Args {
    #[arg(long, env = "AF_AGENT_KEY")]
    agent_key: PathBuf,

    #[arg(long, env = "AF_OWNER")]
    owner: String,

    /// Path to the service keypair (the one registered via
    /// `register-service`). Required because the reputation half of each
    /// tick is signed by the service, not the agent.
    #[arg(long, env = "AF_SERVICE_KEY")]
    service_key: PathBuf,

    #[arg(long, default_value_t = 60)]
    interval_secs: u64,

    #[arg(long, default_value_t = 0.01)]
    amount_per_tick: f64,

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

fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .compact()
        .init();

    let args = Args::parse();
    if args.amount_per_tick <= 0.0 {
        return Err(anyhow!("--amount-per-tick must be > 0"));
    }
    let amount_micro = (args.amount_per_tick * 1_000_000.0).round() as u64;
    if amount_micro == 0 {
        return Err(anyhow!(
            "--amount-per-tick {} rounds to zero micro-USDC",
            args.amount_per_tick
        ));
    }

    let service_keypair = load_keypair(&args.service_key)?;
    let service_pk = service_keypair.pubkey();

    let spender = Spender {
        agent: load_keypair(&args.agent_key)?,
        owner: Pubkey::from_str(&args.owner)
            .with_context(|| format!("invalid --owner: {}", args.owner))?,
        service: service_pk,
        usdc_mint: Pubkey::from_str(&args.usdc_mint)
            .with_context(|| format!("invalid --usdc-mint: {}", args.usdc_mint))?,
        program: Pubkey::from_str(&args.credit_vault_program).with_context(|| {
            format!("invalid --credit-vault-program: {}", args.credit_vault_program)
        })?,
        reputation_program: Pubkey::from_str(&args.reputation_program).with_context(|| {
            format!("invalid --reputation-program: {}", args.reputation_program)
        })?,
        rpc: RpcClient::new_with_commitment(
            args.rpc_url.clone(),
            CommitmentConfig::confirmed(),
        ),
    };

    tracing::info!(
        agent = %spender.agent.pubkey_for_log(),
        service = %service_pk,
        interval_secs = args.interval_secs,
        amount_per_tick = args.amount_per_tick,
        "starting pyth logger — Ctrl-C to stop"
    );

    let mut consecutive_errors: u32 = 0;
    let mut tick_counter: u64 = 0;
    let url = format!("{HERMES_BASE}?ids[]={BTC_USD_FEED}");
    loop {
        tick_counter = tick_counter.wrapping_add(1);
        match fetch_btc_usd(&url) {
            Ok(price) => {
                let receipt = build_receipt(
                    &spender.agent.pubkey_for_log(),
                    &service_pk.to_string(),
                    tick_counter,
                    price,
                );
                match spender.pay(amount_micro, &service_keypair, receipt) {
                    Ok(sig) => {
                        consecutive_errors = 0;
                        tracing::info!(
                            btc_usd = %format!("{price:.2}"),
                            spent_usdc = args.amount_per_tick,
                            signature = %sig,
                            "tick"
                        );
                    }
                    Err(err) => {
                        consecutive_errors += 1;
                        tracing::error!(
                            error = %err,
                            consecutive_errors,
                            "pay failed (vault empty? service not registered? policy violation?)"
                        );
                    }
                }
            }
            Err(err) => {
                consecutive_errors += 1;
                tracing::warn!(error = %err, consecutive_errors, "pyth fetch failed");
            }
        }

        // Surrender after sustained failure rather than burning down the
        // vault on retries that may have already partially succeeded.
        if consecutive_errors >= 10 {
            return Err(anyhow!(
                "giving up after {consecutive_errors} consecutive failures"
            ));
        }
        thread::sleep(Duration::from_secs(args.interval_secs));
    }
}

// Receipt hash must be unique per (agent, service, payment) — the on-chain
// `receipt_used` PDA refuses to init twice for the same hash, which is the
// replay defence. Hash includes tick counter + price + wall-clock seconds so
// collisions are impossible across restarts.
fn build_receipt(agent: &str, service: &str, tick: u64, price: f64) -> [u8; 32] {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let mut h = Sha256::new();
    h.update(agent.as_bytes());
    h.update(b"|");
    h.update(service.as_bytes());
    h.update(b"|");
    h.update(tick.to_le_bytes());
    h.update(b"|");
    h.update(price.to_le_bytes());
    h.update(b"|");
    h.update(now.to_le_bytes());
    let out = h.finalize();
    let mut buf = [0u8; 32];
    buf.copy_from_slice(&out);
    buf
}

#[derive(Deserialize)]
struct HermesResp {
    parsed: Vec<ParsedFeed>,
}

#[derive(Deserialize)]
struct ParsedFeed {
    price: PriceWire,
}

#[derive(Deserialize)]
struct PriceWire {
    price: String,
    expo: i32,
}

fn fetch_btc_usd(url: &str) -> Result<f64> {
    let body: HermesResp = ureq::get(url)
        .timeout(Duration::from_secs(10))
        .call()
        .with_context(|| format!("GET {url}"))?
        .into_json()?;
    let feed = body
        .parsed
        .first()
        .ok_or_else(|| anyhow!("Hermes returned empty parsed[]"))?;
    let raw: f64 = feed
        .price
        .price
        .parse()
        .with_context(|| format!("price field not numeric: {}", feed.price.price))?;
    Ok(raw * 10f64.powi(feed.price.expo))
}

// Tiny extension trait so log lines stay one-liners. Solana's Keypair
// hides its Display impl behind a `Signer` import dance; this just
// returns the base58 pubkey.
trait PubkeyForLog {
    fn pubkey_for_log(&self) -> String;
}
impl PubkeyForLog for solana_sdk::signature::Keypair {
    fn pubkey_for_log(&self) -> String {
        solana_sdk::signature::Signer::pubkey(self).to_string()
    }
}
