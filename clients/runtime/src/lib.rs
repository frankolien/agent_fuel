// Library surface of the Agent Fuel runtime.
//
// `main.rs` is the CLI front end (`agent-runtime spend`, `register-service`,
// etc). Anything that should be reusable from external agents — instruction
// builders, PDA derivations, the high-level [`Spender`] convenience — lives
// here so other binaries / `examples/*.rs` can `use agent_fuel_runtime::…`.

use std::fs;
use std::path::PathBuf;

use anyhow::{anyhow, Context, Result};
use sha2::{Digest, Sha256};
use solana_client::client_error::{ClientError, ClientErrorKind};
use solana_client::rpc_client::RpcClient;
use solana_client::rpc_request::RpcError;
use solana_client::rpc_response::RpcSimulateTransactionResult;
use solana_sdk::instruction::{AccountMeta, Instruction};
use solana_sdk::pubkey;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::{Keypair, Signature, Signer};
use solana_sdk::transaction::Transaction;

pub const ATA_PROGRAM_ID: Pubkey =
    pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
pub const SYSTEM_PROGRAM_ID: Pubkey = pubkey!("11111111111111111111111111111111");

pub fn derive_vault(program: &Pubkey, owner: &Pubkey, agent: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"vault", owner.as_ref(), agent.as_ref()], program).0
}

pub fn derive_policy(program: &Pubkey, vault: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"policy", vault.as_ref()], program).0
}

pub fn derive_ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[owner.as_ref(), spl_token::id().as_ref(), mint.as_ref()],
        &ATA_PROGRAM_ID,
    )
    .0
}

pub fn derive_pending_spend(program: &Pubkey, vault: &Pubkey, nonce: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[b"pending", vault.as_ref(), &nonce.to_le_bytes()],
        program,
    )
    .0
}

// Reputation-program PDAs. Kept here so the example bot and any external
// agent code share the same derivation as `register-service` / record_payment.

pub fn derive_agent_profile(reputation_program: &Pubkey, agent: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"agent", agent.as_ref()], reputation_program).0
}

pub fn derive_service_registry(reputation_program: &Pubkey, service: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"service", service.as_ref()], reputation_program).0
}

pub fn derive_agent_service_link(
    reputation_program: &Pubkey,
    agent_profile: &Pubkey,
    service_registry: &Pubkey,
) -> Pubkey {
    Pubkey::find_program_address(
        &[b"link", agent_profile.as_ref(), service_registry.as_ref()],
        reputation_program,
    )
    .0
}

pub fn derive_receipt_used(reputation_program: &Pubkey, receipt_hash: &[u8; 32]) -> Pubkey {
    Pubkey::find_program_address(&[b"receipt", receipt_hash], reputation_program).0
}

/// Builds the reputation-program `record_payment` instruction. The service
/// is the signer — agents cannot call this on their own behalf (the on-chain
/// design's anti-fake-rep guarantee). For dogfood scenarios where the same
/// operator controls both the agent and the service, the example bot signs
/// twice in the same tx.
#[allow(clippy::too_many_arguments)]
pub fn record_payment_ix(
    reputation_program: &Pubkey,
    service: &Pubkey,
    agent_profile: &Pubkey,
    service_registry: &Pubkey,
    agent_service_link: &Pubkey,
    receipt_used: &Pubkey,
    amount_usdc: u64,
    receipt_hash: [u8; 32],
) -> Instruction {
    let mut data = Vec::with_capacity(8 + 8 + 32);
    data.extend_from_slice(&anchor_discriminator(b"global:record_payment"));
    data.extend_from_slice(&amount_usdc.to_le_bytes());
    data.extend_from_slice(&receipt_hash);

    Instruction {
        program_id: *reputation_program,
        accounts: vec![
            AccountMeta::new(*service, true),
            AccountMeta::new(*agent_profile, false),
            AccountMeta::new(*service_registry, false),
            AccountMeta::new(*agent_service_link, false),
            AccountMeta::new(*receipt_used, false),
            AccountMeta::new_readonly(SYSTEM_PROGRAM_ID, false),
        ],
        data,
    }
}

/// Builds the reputation-program `compute_score` instruction. Permissionless:
/// any signer can poke a recompute, since the inputs (transaction count,
/// service diversity, streak, tenure, feedback) are already public on chain.
/// We bundle this after `record_payment` in `pay()` / `pay_batch()` so the
/// on-chain `agent_profile.score` — and the backend mirror that follows
/// the resulting `ScoreComputed` event — actually advances when the agent
/// makes a payment. Without it, the score stays at its initial value
/// because nothing in the codebase triggers compute_score on its own.
pub fn compute_score_ix(
    reputation_program: &Pubkey,
    caller: &Pubkey,
    agent_profile: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: *reputation_program,
        accounts: vec![
            AccountMeta::new_readonly(*caller, true),
            AccountMeta::new(*agent_profile, false),
        ],
        data: anchor_discriminator(b"global:compute_score").to_vec(),
    }
}

pub fn anchor_discriminator(name: &[u8]) -> [u8; 8] {
    let mut h = Sha256::new();
    h.update(name);
    let out = h.finalize();
    let mut disc = [0u8; 8];
    disc.copy_from_slice(&out[..8]);
    disc
}

pub fn spend_ix(
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

pub fn request_spend_ix(
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

// Offset of `pending_count` inside the CreditVault account, computed from
// state.rs:
//   8 (disc) + 32*4 (owner/agent/usdc_mint/vault_token_account) + 8*4
//   (total_*) + 1 (frozen) + 8*2 (slots) + 1 (bump) = 186.
pub const PENDING_COUNT_OFFSET: usize = 186;

pub fn fetch_pending_count(rpc: &RpcClient, vault: &Pubkey) -> Result<u64> {
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

pub fn load_keypair(path: &PathBuf) -> Result<Keypair> {
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

// Pulls the most actionable line out of an RPC error chain — preflight
// simulations carry `logs: Vec<String>` which usually contain the program's
// own AnchorError message. We prefer those over the generic "custom program
// error: 0xN" wrapper. Returns a one-line summary, joining program log lines
// with " | " so the tail is greppable.
pub fn summarize_rpc_error(err: &ClientError) -> String {
    if let ClientErrorKind::RpcError(RpcError::RpcResponseError {
        data:
            solana_client::rpc_request::RpcResponseErrorData::SendTransactionPreflightFailure(
                RpcSimulateTransactionResult {
                    logs: Some(lines), ..
                },
            ),
        message,
        ..
    }) = err.kind()
    {
        let interesting: Vec<&str> = lines
            .iter()
            .map(String::as_str)
            .filter(|l| {
                l.contains("AnchorError")
                    || l.contains("Error:")
                    || l.contains("failed")
                    || l.contains("Allocate:")
            })
            .collect();
        if !interesting.is_empty() {
            return format!("{message} | logs: {}", interesting.join(" | "));
        }
        return format!("{message} | logs: {}", lines.join(" | "));
    }
    err.to_string()
}

pub fn expand_tilde(path: &PathBuf) -> PathBuf {
    let s = path.to_string_lossy();
    if let Some(rest) = s.strip_prefix("~/") {
        if let Some(home) = std::env::var_os("HOME") {
            return PathBuf::from(home).join(rest);
        }
    }
    path.clone()
}

/// High-level convenience for "agent pays a service" flows. Embeds the agent
/// keypair, mint, program IDs, and an RPC client; exposes `spend()` for raw
/// vault drains and `pay()` for the atomic spend + reputation record_payment
/// pair. Both take the service per-call so a single Spender can rotate across
/// multiple registered services (one process, N services, M ticks/service).
///
/// Construct once at startup, call repeatedly from the agent's main loop.
pub struct Spender {
    pub agent: Keypair,
    pub owner: Pubkey,
    pub usdc_mint: Pubkey,
    pub program: Pubkey,
    pub reputation_program: Pubkey,
    pub rpc: RpcClient,
}

impl Spender {
    pub fn spend(&self, service: &Pubkey, amount_micro: u64) -> Result<Signature> {
        let ix = self.build_spend_ix(service, amount_micro);
        self.submit(&[ix], &[&self.agent])
    }

    /// Atomic spend + record_payment. The service keypair signs the rep half.
    /// The receipt hash must be unique per (agent, service, slot) call — a
    /// repeat hash hits `AccountAlreadyInUse` and aborts the tx (anti-replay).
    pub fn pay(
        &self,
        amount_micro: u64,
        service_keypair: &Keypair,
        receipt_hash: [u8; 32],
    ) -> Result<Signature> {
        let agent_pk = self.agent.pubkey();
        let service_pk = service_keypair.pubkey();
        let spend = self.build_spend_ix(&service_pk, amount_micro);

        let agent_profile = derive_agent_profile(&self.reputation_program, &agent_pk);
        let service_registry = derive_service_registry(&self.reputation_program, &service_pk);
        let agent_service_link = derive_agent_service_link(
            &self.reputation_program,
            &agent_profile,
            &service_registry,
        );
        let receipt_used = derive_receipt_used(&self.reputation_program, &receipt_hash);

        let record = record_payment_ix(
            &self.reputation_program,
            &service_pk,
            &agent_profile,
            &service_registry,
            &agent_service_link,
            &receipt_used,
            amount_micro,
            receipt_hash,
        );
        let compute = compute_score_ix(&self.reputation_program, &agent_pk, &agent_profile);

        self.submit(&[spend, record, compute], &[&self.agent, service_keypair])
    }

    /// Atomic spend + record_payment for N items, all signed by the same
    /// service keypair, in one transaction. For high-throughput bots
    /// (ML inference, RPC frontends) where per-call tx latency + fees
    /// would dominate: amortise both across a batch. Same anti-replay
    /// guarantee per-item via distinct receipt hashes.
    ///
    /// Items are `(amount_micro, receipt_hash)`. Transaction size is
    /// bounded by Solana's 1232-byte limit — practical ceiling is ~10
    /// items per batch with the current account-meta layout. Callers
    /// should flush at that bound or smaller.
    pub fn pay_batch(
        &self,
        items: &[(u64, [u8; 32])],
        service_keypair: &Keypair,
    ) -> Result<Signature> {
        if items.is_empty() {
            return Err(anyhow!("pay_batch called with no items"));
        }
        let service_pk = service_keypair.pubkey();
        let agent_pk = self.agent.pubkey();
        let agent_profile = derive_agent_profile(&self.reputation_program, &agent_pk);
        let service_registry = derive_service_registry(&self.reputation_program, &service_pk);
        let agent_service_link = derive_agent_service_link(
            &self.reputation_program,
            &agent_profile,
            &service_registry,
        );

        let mut ixs = Vec::with_capacity(items.len() * 2 + 1);
        for (amount_micro, receipt_hash) in items {
            ixs.push(self.build_spend_ix(&service_pk, *amount_micro));
            let receipt_used =
                derive_receipt_used(&self.reputation_program, receipt_hash);
            ixs.push(record_payment_ix(
                &self.reputation_program,
                &service_pk,
                &agent_profile,
                &service_registry,
                &agent_service_link,
                &receipt_used,
                *amount_micro,
                *receipt_hash,
            ));
        }
        // One compute_score after the whole batch — counters have been
        // bumped by every record_payment above, so the score reflects the
        // post-batch totals in the same tx.
        ixs.push(compute_score_ix(
            &self.reputation_program,
            &agent_pk,
            &agent_profile,
        ));
        self.submit(&ixs, &[&self.agent, service_keypair])
    }

    /// Agent-initiated half of the over-limit approval flow: enqueues a
    /// pending request the owner can later approve via mobile / CLI. The
    /// returned pubkey is the `PendingSpend` PDA the caller can poll for
    /// resolution. Reads the current `pending_count` off the vault to
    /// derive the nonce; concurrent requestors race here, so retry on
    /// `AccountAlreadyInUse`.
    pub fn request_spend(
        &self,
        service: &Pubkey,
        amount_micro: u64,
    ) -> Result<(Signature, Pubkey, u64)> {
        let agent_pk = self.agent.pubkey();
        let vault = derive_vault(&self.program, &self.owner, &agent_pk);
        let service_ata = derive_ata(service, &self.usdc_mint);
        let nonce = fetch_pending_count(&self.rpc, &vault)?;
        let pending_spend = derive_pending_spend(&self.program, &vault, nonce);
        let ix = request_spend_ix(
            &self.program,
            &agent_pk,
            &vault,
            &service_ata,
            &pending_spend,
            amount_micro,
        );
        let sig = self.submit(&[ix], &[&self.agent])?;
        Ok((sig, pending_spend, nonce))
    }

    // Sign, send, confirm. On `send_and_confirm_transaction` failure, the
    // error chain already includes the simulation logs from the RPC client —
    // but we wrap with the program log lines extracted from the chained
    // error so a tail-only operator log surface is enough to diagnose.
    fn submit(&self, ixs: &[Instruction], signers: &[&Keypair]) -> Result<Signature> {
        let agent_pk = self.agent.pubkey();
        let blockhash = self
            .rpc
            .get_latest_blockhash()
            .context("failed to fetch recent blockhash")?;
        let tx = Transaction::new_signed_with_payer(ixs, Some(&agent_pk), signers, blockhash);
        match self.rpc.send_and_confirm_transaction(&tx) {
            Ok(sig) => Ok(sig),
            Err(err) => {
                let summary = summarize_rpc_error(&err);
                Err(anyhow!("transaction failed: {summary}"))
            }
        }
    }

    fn build_spend_ix(&self, service: &Pubkey, amount_micro: u64) -> Instruction {
        let agent_pk = self.agent.pubkey();
        let vault = derive_vault(&self.program, &self.owner, &agent_pk);
        let policy = derive_policy(&self.program, &vault);
        let vault_ata = derive_ata(&vault, &self.usdc_mint);
        let service_ata = derive_ata(service, &self.usdc_mint);
        spend_ix(
            &self.program,
            &agent_pk,
            &vault,
            &policy,
            &vault_ata,
            &service_ata,
            amount_micro,
        )
    }
}
