// Agent Fuel example: bot side of the over-limit approval flow.
//
// What this teaches that pyth_logger doesn't: how a bot reacts when a
// trade exceeds the vault's per-tx policy. Instead of failing, the bot
// calls `request_spend`, which enqueues a pending request the owner can
// approve from their phone. The bot then polls the `PendingSpend`
// account until it resolves: account exists → still pending; account
// closed → approved (vault transfer happened via approve_spend CPI) or
// rejected (cancel_spend just closed it, no transfer). The bot
// disambiguates by checking whether the agent's spend records moved.
//
//   cargo run -p agent_fuel_runtime --example over_limit_request -- \
//     --agent-key   ~/.config/solana/agent.json \
//     --owner       <OWNER_WALLET_B58> \
//     --service     <REGISTERED_SERVICE_B58> \
//     --amount      30 \
//     --timeout     300
//
// The example sends ONE request and waits up to --timeout seconds for a
// verdict, then exits. A long-running bot would loop, route around
// rejections, and resubmit. This is the minimal "request → poll →
// verdict" skeleton.

use std::path::PathBuf;
use std::str::FromStr;
use std::thread;
use std::time::{Duration, Instant};

use agent_fuel_runtime::{derive_vault, load_keypair, Spender};
use anyhow::{anyhow, Context, Result};
use clap::Parser;
use solana_client::client_error::ClientErrorKind;
use solana_client::rpc_client::RpcClient;
use solana_client::rpc_request::RpcError;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Signer;

#[derive(Parser, Debug)]
#[command(
    name = "over-limit-request",
    about = "Submits an over-limit spend request and waits for the owner's verdict.",
    version
)]
struct Args {
    #[arg(long, env = "AF_AGENT_KEY")]
    agent_key: PathBuf,

    #[arg(long, env = "AF_OWNER")]
    owner: String,

    #[arg(long)]
    service: String,

    /// USDC the request is for. Must exceed the vault's per_tx limit
    /// or the on-chain handler rejects with `BelowApprovalThreshold`.
    #[arg(long)]
    amount: f64,

    /// How long to wait for a verdict before giving up.
    #[arg(long, default_value_t = 300)]
    timeout: u64,

    /// How often to poll the PendingSpend account.
    #[arg(long, default_value_t = 5)]
    poll_interval_secs: u64,

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

#[derive(Debug)]
enum Verdict {
    Approved,
    Rejected,
    TimedOut,
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
    if args.amount <= 0.0 {
        return Err(anyhow!("--amount must be > 0"));
    }
    let amount_micro = (args.amount * 1_000_000.0).round() as u64;
    if amount_micro == 0 {
        return Err(anyhow!("amount {} rounds to zero micro-USDC", args.amount));
    }

    let agent = load_keypair(&args.agent_key)?;
    let owner = Pubkey::from_str(&args.owner)
        .with_context(|| format!("invalid --owner: {}", args.owner))?;
    let service = Pubkey::from_str(&args.service)
        .with_context(|| format!("invalid --service: {}", args.service))?;
    let usdc_mint = Pubkey::from_str(&args.usdc_mint)
        .with_context(|| format!("invalid --usdc-mint: {}", args.usdc_mint))?;
    let program = Pubkey::from_str(&args.credit_vault_program)
        .with_context(|| format!("invalid --credit-vault-program: {}", args.credit_vault_program))?;
    let reputation_program = Pubkey::from_str(&args.reputation_program)
        .with_context(|| format!("invalid --reputation-program: {}", args.reputation_program))?;

    let spender = Spender {
        agent,
        owner,
        usdc_mint,
        program,
        reputation_program,
        rpc: RpcClient::new_with_commitment(args.rpc_url.clone(), CommitmentConfig::confirmed()),
    };
    let agent_pk = spender.agent.pubkey();
    let vault = derive_vault(&spender.program, &spender.owner, &agent_pk);

    // Snapshot the agent's spend records BEFORE submitting — once the
    // pending account closes we compare against this to tell approved
    // (records moved) from rejected (records unchanged).
    let baseline = read_spend_baseline(&spender.rpc, &vault)?;

    tracing::info!(
        agent = %agent_pk,
        vault = %vault,
        service = %service,
        amount_usdc = args.amount,
        "submitting request_spend"
    );
    let (sig, pending_spend, nonce) = spender.request_spend(&service, amount_micro)?;
    tracing::info!(
        signature = %sig,
        pending_spend = %pending_spend,
        nonce,
        "request submitted — open the mobile app or run `agent-runtime` to approve/reject"
    );

    let verdict = wait_for_verdict(
        &spender,
        &vault,
        &pending_spend,
        baseline,
        Duration::from_secs(args.timeout),
        Duration::from_secs(args.poll_interval_secs),
    )?;
    match verdict {
        Verdict::Approved => {
            tracing::info!("APPROVED — vault transfer landed. Bot should proceed with the trade.");
            // Real bot would now `execute_trade()` knowing the funds moved.
        }
        Verdict::Rejected => {
            tracing::warn!("REJECTED — owner cancelled the spend. Route around or alert.");
        }
        Verdict::TimedOut => {
            tracing::warn!(
                timeout = args.timeout,
                "TIMEOUT — request still pending. Bot can keep polling or abandon."
            );
        }
    }
    Ok(())
}

/// Snapshot we use to disambiguate approved vs rejected once the
/// PendingSpend account closes. On approval, the credit_vault's
/// `approve_spend` instruction CPIs into `spend`, which advances both
/// `total_spent` and `total_transactions`. On rejection, `cancel_spend`
/// just closes the account — no records change.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct SpendBaseline {
    total_spent: u64,
    total_transactions: u64,
}

// Offsets into CreditVault account data, computed from
// programs/credit_vault/src/state.rs:
//   8 (disc) + 32*4 (owner/agent/usdc_mint/vault_token_account) = 136
//   total_deposited: 136..144
//   total_spent:     144..152
//   total_withdrawn: 152..160
//   total_transactions: 160..168
const VAULT_TOTAL_SPENT_OFFSET: usize = 144;
const VAULT_TOTAL_TX_OFFSET: usize = 160;

fn read_spend_baseline(rpc: &RpcClient, vault: &Pubkey) -> Result<SpendBaseline> {
    let account = rpc
        .get_account(vault)
        .with_context(|| format!("vault account not found: {vault}"))?;
    if account.data.len() < VAULT_TOTAL_TX_OFFSET + 8 {
        return Err(anyhow!(
            "vault account too small ({} bytes) to read totals",
            account.data.len()
        ));
    }
    let total_spent = u64::from_le_bytes(
        account.data[VAULT_TOTAL_SPENT_OFFSET..VAULT_TOTAL_SPENT_OFFSET + 8]
            .try_into()
            .unwrap(),
    );
    let total_transactions = u64::from_le_bytes(
        account.data[VAULT_TOTAL_TX_OFFSET..VAULT_TOTAL_TX_OFFSET + 8]
            .try_into()
            .unwrap(),
    );
    Ok(SpendBaseline {
        total_spent,
        total_transactions,
    })
}

fn wait_for_verdict(
    spender: &Spender,
    vault: &Pubkey,
    pending_spend: &Pubkey,
    baseline: SpendBaseline,
    timeout: Duration,
    interval: Duration,
) -> Result<Verdict> {
    let start = Instant::now();
    loop {
        if start.elapsed() >= timeout {
            return Ok(Verdict::TimedOut);
        }
        thread::sleep(interval);

        // Re-fetch the pending account. The two "good" outcomes both
        // close it; we can't tell them apart from the RPC alone.
        let exists = match spender.rpc.get_account(pending_spend) {
            Ok(_) => true,
            Err(err) if is_account_not_found(&err) => false,
            Err(err) => {
                tracing::warn!(error = %err, "pending account fetch failed, retrying");
                continue;
            }
        };
        if exists {
            tracing::debug!(elapsed_secs = start.elapsed().as_secs(), "still pending");
            continue;
        }

        // Account is gone — compare vault totals to baseline to learn
        // which side fired.
        let current = read_spend_baseline(&spender.rpc, vault)?;
        let approved = current.total_transactions > baseline.total_transactions
            && current.total_spent > baseline.total_spent;
        return Ok(if approved {
            Verdict::Approved
        } else {
            Verdict::Rejected
        });
    }
}

fn is_account_not_found(err: &solana_client::client_error::ClientError) -> bool {
    // RPC returns either `AccountNotFound` or a generic
    // "could not find account" error string depending on commitment
    // level. Check both.
    if matches!(
        err.kind(),
        ClientErrorKind::RpcError(RpcError::ForUser(_))
    ) {
        return err.to_string().to_lowercase().contains("could not find account");
    }
    err.to_string().to_lowercase().contains("could not find account")
}

