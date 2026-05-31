// Agent Fuel example: high-throughput inference bot that accumulates
// per-call charges and settles them in batched transactions instead of
// one tx per inference.
//
// What this teaches that pyth_logger doesn't: at hundreds of calls per
// second, settling one tx per call burns more in Solana fees and RTT
// than the cost of the inference itself. `Spender::pay_batch` packs N
// (spend + record_payment) pairs into one transaction — amortising
// signature, fee, and confirmation latency across the whole batch.
//
//   cargo run -p agent_fuel_runtime --example batched_inference -- \
//     --agent-key      ~/.config/solana/agent.json \
//     --owner          <OWNER_WALLET_B58> \
//     --service-key    ~/.config/solana/svc-inference.json \
//     --batch-size     8 \
//     --rps            20 \
//     --cost-per-call  0.001
//
// The bot simulates an inference workload at the requested rate. Every
// time the pending list hits --batch-size, it flushes. Smaller batches
// reduce reputation-accrual latency; larger batches amortise tx
// overhead better. The on-chain hard limit is ~10 items per batch
// (1232-byte tx size cap with the current account-meta layout).

use std::collections::VecDeque;
use std::path::PathBuf;
use std::str::FromStr;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

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
    name = "batched-inference",
    about = "Accumulates per-inference charges and settles them in batched txs.",
    version
)]
struct Args {
    #[arg(long, env = "AF_AGENT_KEY")]
    agent_key: PathBuf,

    #[arg(long, env = "AF_OWNER")]
    owner: String,

    /// One service is paid for every inference. Different services per
    /// kind belong in a router example, not a batcher.
    #[arg(long = "service-key", env = "AF_SERVICE_KEY")]
    service_key: PathBuf,

    /// Items per batch. Solana's 1232-byte tx cap means the practical
    /// ceiling is ~10 with the current account-meta layout. 8 is a
    /// comfortable default that leaves headroom.
    #[arg(long, default_value_t = 8)]
    batch_size: usize,

    /// Simulated requests per second. The bot adds one charge per
    /// 1/rps seconds and flushes whenever the queue fills.
    #[arg(long, default_value_t = 10)]
    rps: u32,

    /// USDC per inference. 0.001 = $0.001 = 1000 micro-USDC.
    #[arg(long, default_value_t = 0.001)]
    cost_per_call: f64,

    /// Force-flush after this many seconds even if the batch isn't
    /// full, so reputation doesn't lag forever on a slow request rate.
    #[arg(long, default_value_t = 30)]
    max_idle_secs: u64,

    /// Stop after this many flushed batches. 0 = run until Ctrl-C.
    #[arg(long, default_value_t = 0)]
    max_batches: u64,

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

struct Batcher {
    spender: Spender,
    service: Keypair,
    batch_size: usize,
    max_idle: Duration,
    pending: VecDeque<(u64, [u8; 32])>,
    last_flush: Instant,
    flushed: u64,
}

impl Batcher {
    /// Adds one charge to the queue. Flushes when full; otherwise just
    /// returns. A real bot would also call [Self::tick] from a timer
    /// thread so an idle queue eventually settles.
    fn enqueue(&mut self, amount_micro: u64, receipt_hash: [u8; 32]) -> Result<()> {
        self.pending.push_back((amount_micro, receipt_hash));
        if self.pending.len() >= self.batch_size {
            self.flush()?;
        }
        Ok(())
    }

    /// Idle flush — if the batch isn't full but max-idle has elapsed,
    /// settle what we have so reputation doesn't lag.
    fn tick(&mut self) -> Result<()> {
        if !self.pending.is_empty() && self.last_flush.elapsed() >= self.max_idle {
            self.flush()?;
        }
        Ok(())
    }

    fn flush(&mut self) -> Result<()> {
        if self.pending.is_empty() {
            return Ok(());
        }
        let items: Vec<(u64, [u8; 32])> = self.pending.drain(..).collect();
        let total: u64 = items.iter().map(|(a, _)| *a).sum();
        let sig = self.spender.pay_batch(&items, &self.service)?;
        self.last_flush = Instant::now();
        self.flushed += 1;
        tracing::info!(
            count = items.len(),
            total_micro = total,
            total_usdc = format!("{:.6}", total as f64 / 1_000_000.0),
            signature = %sig,
            "batch settled"
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
    if args.batch_size == 0 || args.batch_size > 10 {
        return Err(anyhow!(
            "--batch-size must be 1..=10 (Solana tx size cap), got {}",
            args.batch_size
        ));
    }
    if args.rps == 0 {
        return Err(anyhow!("--rps must be > 0"));
    }
    let amount_micro = (args.cost_per_call * 1_000_000.0).round() as u64;
    if amount_micro == 0 {
        return Err(anyhow!(
            "--cost-per-call {} rounds to zero micro-USDC",
            args.cost_per_call
        ));
    }

    let agent = load_keypair(&args.agent_key)?;
    let service = load_keypair(&args.service_key)?;
    let owner = Pubkey::from_str(&args.owner)
        .with_context(|| format!("invalid --owner: {}", args.owner))?;
    let usdc_mint = Pubkey::from_str(&args.usdc_mint)
        .with_context(|| format!("invalid --usdc-mint: {}", args.usdc_mint))?;
    let program = Pubkey::from_str(&args.credit_vault_program)
        .with_context(|| format!("invalid --credit-vault-program: {}", args.credit_vault_program))?;
    let reputation_program = Pubkey::from_str(&args.reputation_program)
        .with_context(|| format!("invalid --reputation-program: {}", args.reputation_program))?;

    let mut batcher = Batcher {
        spender: Spender {
            agent,
            owner,
            usdc_mint,
            program,
            reputation_program,
            rpc: RpcClient::new_with_commitment(
                args.rpc_url.clone(),
                CommitmentConfig::confirmed(),
            ),
        },
        service,
        batch_size: args.batch_size,
        max_idle: Duration::from_secs(args.max_idle_secs),
        pending: VecDeque::with_capacity(args.batch_size),
        last_flush: Instant::now(),
        flushed: 0,
    };

    tracing::info!(
        agent = %batcher.spender.agent.pubkey(),
        service = %batcher.service.pubkey(),
        batch_size = args.batch_size,
        rps = args.rps,
        cost_per_call_usdc = args.cost_per_call,
        "starting batched-inference — Ctrl-C to stop"
    );

    let per_call = Duration::from_millis(1000 / args.rps as u64);
    let mut request_id: u64 = 0;
    loop {
        request_id += 1;
        let receipt = build_receipt(
            &batcher.spender.agent.pubkey().to_string(),
            &batcher.service.pubkey().to_string(),
            request_id,
        );
        if let Err(err) = batcher.enqueue(amount_micro, receipt) {
            tracing::error!(error = %err, "enqueue/flush failed");
        }
        batcher.tick().ok();

        if args.max_batches > 0 && batcher.flushed >= args.max_batches {
            tracing::info!(flushed = batcher.flushed, "reached --max-batches, exiting");
            batcher.flush().ok();
            return Ok(());
        }
        thread::sleep(per_call);
    }
}

fn build_receipt(agent: &str, service: &str, request_id: u64) -> [u8; 32] {
    let now_nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let mut h = Sha256::new();
    h.update(agent.as_bytes());
    h.update(b"|");
    h.update(service.as_bytes());
    h.update(b"|inference|");
    h.update(request_id.to_le_bytes());
    h.update(b"|");
    h.update(now_nanos.to_le_bytes());
    let out = h.finalize();
    let mut buf = [0u8; 32];
    buf.copy_from_slice(&out);
    buf
}
