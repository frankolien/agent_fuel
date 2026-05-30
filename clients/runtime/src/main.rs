// Reference agent runtime for Agent Fuel.
//
// Loads an agent keypair in the same format the mobile app exports
// (`[seed(32) || pubkey(32)]` JSON array — what `solana-keygen` writes),
// derives the credit_vault PDAs from the owner+agent pair, and submits a
// single `spend` instruction to the credit_vault program. The agent signs
// the spend ix; the agent is also the fee payer (it needs a small SOL
// balance).
//
// This binary is intentionally minimal: one ix, one tx, no retries, no
// service-discovery — the goal is to prove the spend loop works end-to-end
// and to give third-party agent frameworks (Eliza, solana-agent-kit, etc.)
// a copy-pasteable reference for how to call credit_vault.

use std::fs;
use std::path::PathBuf;
use std::str::FromStr;

use anyhow::{anyhow, Context, Result};
use clap::Parser;
use sha2::{Digest, Sha256};
use solana_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::instruction::{AccountMeta, Instruction};
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::{Keypair, Signer};
use solana_sdk::transaction::Transaction;

const ATA_PROGRAM_ID: Pubkey = solana_sdk::pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

#[derive(Parser, Debug)]
#[command(
    name = "agent-runtime",
    about = "Agent Fuel reference runtime — spends from a credit vault on chain.",
    version
)]
struct Cli {
    /// Path to the agent keypair JSON (64-byte `[seed || pubkey]` array, the
    /// same format `solana-keygen` and the Agent Fuel mobile app export).
    #[arg(long, env = "AF_AGENT_KEY")]
    agent_key: PathBuf,

    /// Owner (wallet) pubkey — the wallet that provisioned this agent.
    /// Required to derive the vault PDA.
    #[arg(long, env = "AF_OWNER")]
    owner: String,

    /// Amount of USDC to spend, in whole USDC. Converted to micro-USDC
    /// (×1_000_000) before sending.
    #[arg(long)]
    amount: f64,

    /// Pubkey of the service that should receive the USDC. The runtime
    /// derives the service's USDC ATA from this.
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
    let cmd = Spend::from_cli(cli)?;
    cmd.execute()
}

struct Spend {
    agent: Keypair,
    owner: Pubkey,
    amount_micro: u64,
    service: Pubkey,
    usdc_mint: Pubkey,
    program: Pubkey,
    rpc: RpcClient,
    dry_run: bool,
}

impl Spend {
    fn from_cli(cli: Cli) -> Result<Self> {
        let agent = load_keypair(&cli.agent_key)?;
        let owner = Pubkey::from_str(&cli.owner)
            .with_context(|| format!("invalid owner pubkey: {}", cli.owner))?;
        let service = Pubkey::from_str(&cli.service)
            .with_context(|| format!("invalid service pubkey: {}", cli.service))?;
        let usdc_mint = Pubkey::from_str(&cli.usdc_mint)
            .with_context(|| format!("invalid usdc_mint: {}", cli.usdc_mint))?;
        let program = Pubkey::from_str(&cli.credit_vault_program).with_context(|| {
            format!("invalid credit_vault_program: {}", cli.credit_vault_program)
        })?;

        if cli.amount <= 0.0 {
            return Err(anyhow!("amount must be > 0"));
        }
        let amount_micro = (cli.amount * 1_000_000.0).round() as u64;

        Ok(Self {
            agent,
            owner,
            amount_micro,
            service,
            usdc_mint,
            program,
            rpc: RpcClient::new_with_commitment(cli.rpc_url, CommitmentConfig::confirmed()),
            dry_run: cli.dry_run,
        })
    }

    fn execute(self) -> Result<()> {
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
            println!(
                "dry-run: prepared spend(amount_micro={})",
                self.amount_micro
            );
            println!("  agent:        {agent_pk}");
            println!("  vault:        {vault}");
            println!("  policy:       {policy}");
            println!("  vault_ata:    {vault_ata}");
            println!("  service_ata:  {service_ata}");
            return Ok(());
        }

        let blockhash = self
            .rpc
            .get_latest_blockhash()
            .context("failed to fetch recent blockhash")?;
        let tx =
            Transaction::new_signed_with_payer(&[ix], Some(&agent_pk), &[&self.agent], blockhash);

        let sig = self
            .rpc
            .send_and_confirm_transaction(&tx)
            .context("spend transaction failed")?;
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
    let mut data = Vec::with_capacity(8 + 8);
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
    Keypair::try_from(bytes.as_slice()).map_err(|e| anyhow!("invalid ed25519 keypair bytes: {e}"))
}
