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

use std::fs;
use std::path::PathBuf;
use std::str::FromStr;

use anyhow::{anyhow, Context, Result};
use clap::{Args, Parser, Subcommand};
use sha2::{Digest, Sha256};
use solana_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::instruction::{AccountMeta, Instruction};
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::{Keypair, Signer};
use solana_sdk::pubkey;
use solana_sdk::transaction::Transaction;

const ATA_PROGRAM_ID: Pubkey =
    pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const SYSTEM_PROGRAM_ID: Pubkey = pubkey!("11111111111111111111111111111111");

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
        default_value = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
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

fn spend_ix(
    program: &Pubkey,
    agent: &Pubkey,
    vault: &Pubkey,
    policy: &Pubkey,
    vault_ata: &Pubkey,
    service_ata: &Pubkey,
    amount_micro: u64,
) -> Instruction {
    let mut data = Vec::with_capacity(16);
    data.extend_from_slice(&anchor_discriminator(b"global:spend"));
    data.extend_from_slice(&amount_micro.to_le_bytes());

    Instruction {
        program_id: *program,
        accounts: vec![
            AccountMeta::new_readonly(*agent, true),
            AccountMeta::new(*vault, false),
            AccountMeta::new(*policy, false),
            AccountMeta::new(*vault_ata, false),
            AccountMeta::new(*service_ata, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
        data,
    }
}

fn request_spend_ix(
    program: &Pubkey,
    agent: &Pubkey,
    vault: &Pubkey,
    service_ata: &Pubkey,
    pending_spend: &Pubkey,
    amount_micro: u64,
) -> Instruction {
    let mut data = Vec::with_capacity(16);
    data.extend_from_slice(&anchor_discriminator(b"global:request_spend"));
    data.extend_from_slice(&amount_micro.to_le_bytes());

    Instruction {
        program_id: *program,
        accounts: vec![
            // agent is `mut` here because it pays rent for the new PendingSpend.
            AccountMeta::new(*agent, true),
            AccountMeta::new(*vault, false),
            AccountMeta::new_readonly(*service_ata, false),
            AccountMeta::new(*pending_spend, false),
            AccountMeta::new_readonly(SYSTEM_PROGRAM_ID, false),
        ],
        data,
    }
}

fn derive_vault(program: &Pubkey, owner: &Pubkey, agent: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"vault", owner.as_ref(), agent.as_ref()], program).0
}

fn derive_policy(program: &Pubkey, vault: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"policy", vault.as_ref()], program).0
}

fn derive_ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[owner.as_ref(), spl_token::id().as_ref(), mint.as_ref()],
        &ATA_PROGRAM_ID,
    )
    .0
}

fn derive_pending_spend(program: &Pubkey, vault: &Pubkey, nonce: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[b"pending", vault.as_ref(), &nonce.to_le_bytes()],
        program,
    )
    .0
}

// Offset of `pending_count` inside the CreditVault account, computed from
// state.rs:
//   8 (disc) + 32*4 (owner/agent/usdc_mint/vault_token_account) + 8*4
//   (total_*) + 1 (frozen) + 8*2 (slots) + 1 (bump) = 186.
const PENDING_COUNT_OFFSET: usize = 186;

fn fetch_pending_count(rpc: &RpcClient, vault: &Pubkey) -> Result<u64> {
    let account = rpc
        .get_account(vault)
        .with_context(|| format!("vault account not found: {vault}"))?;
    let data = account.data;
    if data.len() < PENDING_COUNT_OFFSET + 8 {
        return Err(anyhow!(
            "vault account too small ({} bytes) to read pending_count",
            data.len()
        ));
    }
    let mut buf = [0u8; 8];
    buf.copy_from_slice(&data[PENDING_COUNT_OFFSET..PENDING_COUNT_OFFSET + 8]);
    Ok(u64::from_le_bytes(buf))
}

fn anchor_discriminator(name: &[u8]) -> [u8; 8] {
    let mut h = Sha256::new();
    h.update(name);
    let out = h.finalize();
    let mut disc = [0u8; 8];
    disc.copy_from_slice(&out[..8]);
    disc
}

fn load_keypair(path: &PathBuf) -> Result<Keypair> {
    let raw = fs::read_to_string(path)
        .with_context(|| format!("failed to read key file: {}", path.display()))?;
    let bytes: Vec<u8> = serde_json::from_str(&raw)
        .with_context(|| format!("key file is not a JSON byte array: {}", path.display()))?;
    if bytes.len() != 64 {
        return Err(anyhow!(
            "expected 64-byte [seed || pubkey] key, got {} bytes",
            bytes.len()
        ));
    }
    Keypair::try_from(bytes.as_slice())
        .map_err(|e| anyhow!("invalid ed25519 keypair bytes: {e}"))
}
