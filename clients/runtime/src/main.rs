// Reference agent runtime for Agent Fuel.
//
// Two subcommands today:
//   * spend          — direct `credit_vault::spend` (subject to per-tx,
//                      hourly, and lifetime limits)
//   * request-spend  — queue an over-limit spend as a PendingSpend PDA
//                      for the owner to approve out of band
//
// The agent JSON key file is the same 64-byte `[seed || pubkey]` format
// that `solana-keygen` writes and the Agent Fuel mobile app exports.

use std::path::PathBuf;
use std::str::FromStr;

use anyhow::{anyhow, Context, Result};
use clap::{Args, Parser, Subcommand};
use solana_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::instruction::{AccountMeta, Instruction};
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::{Keypair, Signer};
use solana_sdk::transaction::Transaction;

use agent_fuel_runtime::{
    anchor_discriminator, derive_ata, derive_pending_spend, derive_policy, derive_vault,
    expand_tilde, fetch_pending_count, load_keypair, request_spend_ix, spend_ix,
    SYSTEM_PROGRAM_ID,
};

#[derive(Parser, Debug)]
#[command(
    name = "agent-runtime",
    about = "Agent Fuel reference runtime — exercises credit_vault on chain.",
    version
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Direct spend — subject to all on-chain policy limits.
    Spend(SpendArgs),
    /// Queue an over-limit spend for owner approval.
    RequestSpend(SpendArgs),
    /// Register a service so agents can spend against it. The service keypair
    /// is its long-lived signing identity (lives in `SpendPolicy.whitelist`,
    /// signs reputation events) and co-signs registration to prevent
    /// front-running. Idempotent only at the keypair level — re-running with
    /// the same key reverts because the PDA already exists.
    RegisterService(RegisterServiceArgs),
}

#[derive(Args, Debug)]
struct SpendArgs {
    /// Path to the agent keypair JSON (64-byte `[seed || pubkey]` array).
    #[arg(long, env = "AF_AGENT_KEY")]
    agent_key: PathBuf,

    /// Owner (wallet) pubkey — required to derive the vault PDA.
    #[arg(long, env = "AF_OWNER")]
    owner: String,

    /// Amount of USDC to spend (whole USDC; converted to micro-USDC).
    #[arg(long)]
    amount: f64,

    /// Service pubkey — runtime derives its USDC ATA.
    #[arg(long, env = "AF_SERVICE")]
    service: String,

    /// USDC mint. Defaults to devnet USDC.
    #[arg(
        long,
        env = "AF_USDC_MINT",
        default_value = "EMm5UveNWJaTfbMcJ8g2w7i2riydKKyZWhauEj8DzRTq"
    )]
    usdc_mint: String,

    /// credit_vault program ID. Defaults to the devnet deployment.
    #[arg(
        long,
        env = "AF_CREDIT_VAULT_PROGRAM",
        default_value = "EsykPsafhHUeN7jA9DGqBiGuBsTBaFynLDVVpE4jFXDg"
    )]
    credit_vault_program: String,

    /// JSON-RPC endpoint.
    #[arg(
        long,
        env = "AF_RPC_URL",
        default_value = "https://api.devnet.solana.com"
    )]
    rpc_url: String,

    /// Print the prepared instruction(s) and exit without sending.
    #[arg(long)]
    dry_run: bool,
}

#[derive(Args, Debug)]
struct RegisterServiceArgs {
    /// Path to the sponsor wallet keypair (pays rent, submits tx).
    #[arg(long, env = "AF_SPONSOR_KEY", default_value = "~/.config/solana/id.json")]
    sponsor_key: PathBuf,

    /// Path to the service keypair (its long-lived signing identity).
    #[arg(long, env = "AF_SERVICE_KEY")]
    service_key: PathBuf,

    /// Display name (≤32 chars, ASCII).
    #[arg(long)]
    name: String,

    /// Category: data-feed | compute | swap | rpc | other.
    #[arg(long, default_value = "other")]
    category: String,

    /// Off-chain metadata URI (≤128 chars). Defaults to empty.
    #[arg(long, default_value = "")]
    uri: String,

    /// reputation program ID. Defaults to the devnet deployment.
    #[arg(
        long,
        env = "AF_REPUTATION_PROGRAM",
        default_value = "4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ"
    )]
    reputation_program: String,

    /// JSON-RPC endpoint.
    #[arg(
        long,
        env = "AF_RPC_URL",
        default_value = "https://api.devnet.solana.com"
    )]
    rpc_url: String,

    /// Print the prepared instruction and exit without sending.
    #[arg(long)]
    dry_run: bool,
}

fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .compact()
        .init();

    let cli = Cli::parse();
    match cli.command {
        Command::Spend(a) => Action::from_args(a)?.run_spend(),
        Command::RequestSpend(a) => Action::from_args(a)?.run_request_spend(),
        Command::RegisterService(a) => run_register_service(a),
    }
}

fn run_register_service(a: RegisterServiceArgs) -> Result<()> {
    let sponsor = load_keypair(&expand_tilde(&a.sponsor_key))?;
    let service = load_keypair(&expand_tilde(&a.service_key))?;
    let program = Pubkey::from_str(&a.reputation_program)
        .with_context(|| format!("invalid reputation_program: {}", a.reputation_program))?;

    let name_bytes = pack_fixed::<32>(&a.name, "name")?;
    let uri_bytes = pack_fixed::<128>(&a.uri, "uri")?;
    let category = parse_category(&a.category)?;

    let service_pk = service.pubkey();
    let registry = Pubkey::find_program_address(
        &[b"service", service_pk.as_ref()],
        &program,
    )
    .0;

    tracing::info!(
        sponsor = %sponsor.pubkey(),
        service = %service_pk,
        registry = %registry,
        name = %a.name,
        category = ?category,
        "preparing register_service"
    );

    let ix = register_service_ix(
        &program,
        &sponsor.pubkey(),
        &service_pk,
        &registry,
        name_bytes,
        category,
        uri_bytes,
    );

    if a.dry_run {
        println!("dry-run: register_service(name={:?}, category={:?})", a.name, category);
        println!("  sponsor:   {}", sponsor.pubkey());
        println!("  service:   {service_pk}");
        println!("  registry:  {registry}");
        return Ok(());
    }

    let rpc = RpcClient::new_with_commitment(a.rpc_url, CommitmentConfig::confirmed());
    let blockhash = rpc
        .get_latest_blockhash()
        .context("failed to fetch recent blockhash")?;
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&sponsor.pubkey()),
        &[&sponsor, &service],
        blockhash,
    );
    let sig = rpc
        .send_and_confirm_transaction(&tx)
        .context("transaction failed")?;
    println!("ok: {sig}");
    println!("  service:   {service_pk}");
    println!("  registry:  {registry}");
    Ok(())
}

fn register_service_ix(
    program: &Pubkey,
    sponsor: &Pubkey,
    service: &Pubkey,
    registry: &Pubkey,
    name: [u8; 32],
    category: u8,
    uri: [u8; 128],
) -> Instruction {
    let mut data = Vec::with_capacity(8 + 32 + 1 + 128);
    data.extend_from_slice(&anchor_discriminator(b"global:register_service"));
    data.extend_from_slice(&name);
    data.push(category);
    data.extend_from_slice(&uri);

    Instruction {
        program_id: *program,
        accounts: vec![
            AccountMeta::new(*sponsor, true),
            AccountMeta::new_readonly(*service, true),
            AccountMeta::new(*registry, false),
            AccountMeta::new_readonly(SYSTEM_PROGRAM_ID, false),
        ],
        data,
    }
}

fn pack_fixed<const N: usize>(s: &str, field: &str) -> Result<[u8; N]> {
    let bytes = s.as_bytes();
    if bytes.len() > N {
        return Err(anyhow!(
            "{field} too long: {} bytes (max {N})",
            bytes.len()
        ));
    }
    let mut out = [0u8; N];
    out[..bytes.len()].copy_from_slice(bytes);
    Ok(out)
}

fn parse_category(s: &str) -> Result<u8> {
    match s.to_ascii_lowercase().as_str() {
        "data-feed" | "datafeed" | "data_feed" => Ok(0),
        "compute" => Ok(1),
        "swap" => Ok(2),
        "rpc" => Ok(3),
        "other" => Ok(4),
        _ => Err(anyhow!(
            "unknown category {s:?} — expected one of: data-feed, compute, swap, rpc, other"
        )),
    }
}

struct Action {
    agent: Keypair,
    owner: Pubkey,
    amount_micro: u64,
    service: Pubkey,
    usdc_mint: Pubkey,
    program: Pubkey,
    rpc: RpcClient,
    dry_run: bool,
}

impl Action {
    fn from_args(a: SpendArgs) -> Result<Self> {
        let agent = load_keypair(&a.agent_key)?;
        let owner = Pubkey::from_str(&a.owner)
            .with_context(|| format!("invalid owner pubkey: {}", a.owner))?;
        let service = Pubkey::from_str(&a.service)
            .with_context(|| format!("invalid service pubkey: {}", a.service))?;
        let usdc_mint = Pubkey::from_str(&a.usdc_mint)
            .with_context(|| format!("invalid usdc_mint: {}", a.usdc_mint))?;
        let program = Pubkey::from_str(&a.credit_vault_program).with_context(|| {
            format!("invalid credit_vault_program: {}", a.credit_vault_program)
        })?;

        if a.amount <= 0.0 {
            return Err(anyhow!("amount must be > 0"));
        }
        let amount_micro = (a.amount * 1_000_000.0).round() as u64;

        Ok(Self {
            agent,
            owner,
            amount_micro,
            service,
            usdc_mint,
            program,
            rpc: RpcClient::new_with_commitment(a.rpc_url, CommitmentConfig::confirmed()),
            dry_run: a.dry_run,
        })
    }

    fn run_spend(self) -> Result<()> {
        let agent_pk = self.agent.pubkey();
        let vault = derive_vault(&self.program, &self.owner, &agent_pk);
        let policy = derive_policy(&self.program, &vault);
        let vault_ata = derive_ata(&vault, &self.usdc_mint);
        let service_ata = derive_ata(&self.service, &self.usdc_mint);

        tracing::info!(
            agent = %agent_pk,
            owner = %self.owner,
            vault = %vault,
            policy = %policy,
            vault_ata = %vault_ata,
            service = %self.service,
            service_ata = %service_ata,
            amount_micro = self.amount_micro,
            "preparing spend"
        );

        let ix = spend_ix(
            &self.program,
            &agent_pk,
            &vault,
            &policy,
            &vault_ata,
            &service_ata,
            self.amount_micro,
        );

        if self.dry_run {
            println!("dry-run: spend(amount_micro={})", self.amount_micro);
            println!("  agent:        {agent_pk}");
            println!("  vault:        {vault}");
            println!("  policy:       {policy}");
            println!("  vault_ata:    {vault_ata}");
            println!("  service_ata:  {service_ata}");
            return Ok(());
        }
        self.submit(ix)
    }

    fn run_request_spend(self) -> Result<()> {
        let agent_pk = self.agent.pubkey();
        let vault = derive_vault(&self.program, &self.owner, &agent_pk);
        let service_ata = derive_ata(&self.service, &self.usdc_mint);

        // Read the vault's pending_count from chain — it's part of the
        // PendingSpend PDA seeds, so we can't fake it.
        let nonce = fetch_pending_count(&self.rpc, &vault)
            .context("could not read vault.pending_count")?;
        let pending_spend = derive_pending_spend(&self.program, &vault, nonce);

        tracing::info!(
            agent = %agent_pk,
            owner = %self.owner,
            vault = %vault,
            service = %self.service,
            service_ata = %service_ata,
            pending_spend = %pending_spend,
            nonce,
            amount_micro = self.amount_micro,
            "preparing request_spend"
        );

        let ix = request_spend_ix(
            &self.program,
            &agent_pk,
            &vault,
            &service_ata,
            &pending_spend,
            self.amount_micro,
        );

        if self.dry_run {
            println!(
                "dry-run: request_spend(amount_micro={}, nonce={})",
                self.amount_micro, nonce
            );
            println!("  agent:           {agent_pk}");
            println!("  vault:           {vault}");
            println!("  service_ata:     {service_ata}");
            println!("  pending_spend:   {pending_spend}");
            return Ok(());
        }
        self.submit(ix)
    }

    fn submit(self, ix: Instruction) -> Result<()> {
        let agent_pk = self.agent.pubkey();
        let blockhash = self
            .rpc
            .get_latest_blockhash()
            .context("failed to fetch recent blockhash")?;
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&agent_pk),
            &[&self.agent],
            blockhash,
        );
        let sig = self
            .rpc
            .send_and_confirm_transaction(&tx)
            .context("transaction failed")?;
        println!("ok: {sig}");
        Ok(())
    }
}

