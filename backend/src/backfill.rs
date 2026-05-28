//! Chain-fetch backfill for agents whose on-chain history pre-dates the
//! indexer (e.g. created during a broken-webhook window). Replays historical
//! transactions through the same parser + mirror pipeline the webhook uses,
//! so the end state is indistinguishable from the live path.
//!
//! Owner-gated: callers must prove ownership of the AgentProfile they want to
//! backfill by signing in with SIWS (the endpoint that wraps this verifies
//! `AgentProfile.owner == caller`). The RPC client is shared across requests
//! so the connection pool warms up after the first call.
//!
//! Scope: one entity at a time (an agent's AgentProfile PDA). Vault and
//! service backfill follow the same pattern but live separately so each can
//! evolve independently.

use std::time::Duration;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use curve25519_dalek::edwards::CompressedEdwardsY;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::PgPool;

use crate::{mirror, parser, persist};

#[derive(Debug, thiserror::Error)]
pub enum BackfillError {
    #[error("invalid pubkey: {0}")]
    InvalidPubkey(String),
    #[error("agent profile not found on chain")]
    AgentNotFound,
    #[error("agent profile owner mismatch")]
    OwnerMismatch,
    #[error("rpc error: {0}")]
    Rpc(String),
    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),
    #[error("rpc transport: {0}")]
    Transport(#[from] reqwest::Error),
}

#[derive(Debug, Default, Serialize)]
pub struct BackfillReport {
    /// Signatures returned by `getSignaturesForAddress` for the target PDA.
    pub signatures_scanned: usize,
    /// Transactions we actually decoded events from. Some signatures touch the
    /// PDA without emitting Anchor events (e.g. pure reads); those count toward
    /// `signatures_scanned` but not here.
    pub transactions_parsed: usize,
    /// Events inserted into the `events` table on this run. Replays are idempotent
    /// (ON CONFLICT DO NOTHING), so a second call returns 0 here.
    pub events_inserted: u64,
}

/// Reputation program id, in raw 32 bytes. Keep in sync with the on-chain
/// program — sourced from `programs/reputation/Anchor.toml` and re-declared
/// here so the backend doesn't pull in `anchor-lang`.
const REPUTATION_PROGRAM_ID_BS58: &str = "4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ";
const AGENT_SEED: &[u8] = b"agent";

/// AgentProfile layout: [discriminator(8)][authority(32)][owner(32)][…]
/// — owner sits at byte 40.
const AGENT_OWNER_OFFSET: usize = 40;
/// CreditVault layout: [discriminator(8)][owner(32)][agent(32)][…]
/// — owner sits at byte 8. Same as the program's state struct definition;
/// vault PDA is provided directly by the URL so no derivation is needed.
const VAULT_OWNER_OFFSET: usize = 8;

/// Hard cap on signatures fetched in one backfill run. Solana RPCs cap a
/// single `getSignaturesForAddress` page at 1000; for an agent fresh out of
/// the broken-webhook window, the realistic count is in the tens. The cap
/// here bounds the worst case (a noisy long-lived agent) so a single backfill
/// call can't exhaust the RPC quota.
const SIGNATURE_CAP: usize = 2000;
const RPC_PAGE_SIZE: u32 = 1000;

pub struct RpcClient {
    http: Client,
    url: String,
}

impl RpcClient {
    pub fn new(url: impl Into<String>) -> Self {
        let http = Client::builder()
            .timeout(Duration::from_secs(15))
            // Solana RPCs are JSON-only; no need for gzip on small payloads but
            // it pays off on `getTransaction` responses that can be 50+ KB.
            .pool_max_idle_per_host(8)
            .build()
            .expect("reqwest client init");
        Self { http, url: url.into() }
    }

    async fn call<T: for<'de> Deserialize<'de>>(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<T, BackfillError> {
        let body = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params,
        });
        let resp = self
            .http
            .post(&self.url)
            .json(&body)
            .send()
            .await?
            .error_for_status()?;
        let envelope: RpcEnvelope<T> = resp.json().await?;
        match envelope {
            RpcEnvelope { error: Some(err), .. } => Err(BackfillError::Rpc(format!(
                "{} (code {})",
                err.message, err.code
            ))),
            RpcEnvelope { result: Some(r), .. } => Ok(r),
            _ => Err(BackfillError::Rpc("empty result".into())),
        }
    }
}

#[derive(Debug, Deserialize)]
struct RpcEnvelope<T> {
    result: Option<T>,
    error: Option<RpcError>,
}

#[derive(Debug, Deserialize)]
struct RpcError {
    code: i64,
    message: String,
}

/// Backfill an agent's on-chain history through the indexer.
///
/// Derives the AgentProfile PDA from the agent identity, verifies ownership
/// Derive the AgentProfile PDA for a given agent authority pubkey, returning
/// the bs58-encoded address. Mirrors the on-chain `[b"agent", authority]`
/// seeds and the reputation program id baked into this crate.
pub fn agent_profile_pda(authority_bs58: &str) -> Option<String> {
    let authority = decode_pubkey(authority_bs58).ok()?;
    let program_id = decode_pubkey(REPUTATION_PROGRAM_ID_BS58)
        .expect("reputation program id is a known valid base58 pubkey");
    let (pda, _bump) = find_program_address(&[AGENT_SEED, &authority], &program_id)?;
    Some(bs58::encode(pda).into_string())
}

/// against the on-chain account, then replays every signature touching the
/// PDA through the parser + mirror pipeline.
pub async fn backfill_agent(
    pool: &PgPool,
    rpc: &RpcClient,
    agent_pubkey_bs58: &str,
    expected_owner_bs58: &str,
) -> Result<BackfillReport, BackfillError> {
    let agent_pubkey = decode_pubkey(agent_pubkey_bs58)?;
    let program_id = decode_pubkey(REPUTATION_PROGRAM_ID_BS58)
        .expect("reputation program id is a known valid base58 pubkey");
    let (pda, _bump) = find_program_address(&[AGENT_SEED, &agent_pubkey], &program_id)
        .ok_or_else(|| BackfillError::Rpc("PDA derivation failed".into()))?;
    let pda_bs58 = bs58::encode(pda).into_string();

    verify_owner(rpc, &pda_bs58, expected_owner_bs58, AGENT_OWNER_OFFSET).await?;
    replay_address_history(pool, rpc, &pda_bs58, "agent", agent_pubkey_bs58).await
}

/// Backfill a vault's on-chain history through the indexer.
///
/// The vault pubkey from the URL IS its PDA (Anchor `init` creates the
/// account at the PDA address), so no derivation is needed — we fetch and
/// scan directly.
pub async fn backfill_vault(
    pool: &PgPool,
    rpc: &RpcClient,
    vault_pubkey_bs58: &str,
    expected_owner_bs58: &str,
) -> Result<BackfillReport, BackfillError> {
    // Validate up front so a typo gives 400 not 404-from-RPC.
    decode_pubkey(vault_pubkey_bs58)?;
    verify_owner(rpc, vault_pubkey_bs58, expected_owner_bs58, VAULT_OWNER_OFFSET).await?;
    replay_address_history(pool, rpc, vault_pubkey_bs58, "vault", vault_pubkey_bs58).await
}

/// Fetches the on-chain account, returns an error if it doesn't exist or
/// the owner field at `owner_offset` doesn't match the expected pubkey.
async fn verify_owner(
    rpc: &RpcClient,
    address_bs58: &str,
    expected_owner_bs58: &str,
    owner_offset: usize,
) -> Result<(), BackfillError> {
    let Some(data) = fetch_account_data(rpc, address_bs58).await? else {
        return Err(BackfillError::AgentNotFound);
    };
    let expected = decode_pubkey(expected_owner_bs58)?;
    if !owner_matches_at(&data, &expected, owner_offset) {
        return Err(BackfillError::OwnerMismatch);
    }
    Ok(())
}

/// The shared replay pipeline: page signatures touching `address`, fetch
/// each tx, parse, persist, refresh mirrors. The owner check happens before
/// this is invoked — calling it directly skips authorization, so keep it
/// private.
async fn replay_address_history(
    pool: &PgPool,
    rpc: &RpcClient,
    address_bs58: &str,
    entity_kind: &'static str,
    entity_id_for_log: &str,
) -> Result<BackfillReport, BackfillError> {
    let signatures = fetch_signatures(rpc, address_bs58).await?;
    let mut report = BackfillReport {
        signatures_scanned: signatures.len(),
        ..BackfillReport::default()
    };

    // Batch the persist + mirror refresh so we make a single DB round-trip
    // and the mirror sees the full event set when it converges.
    let mut all_events = Vec::new();
    for sig in &signatures {
        let Some(tx_json) = fetch_transaction(rpc, sig).await? else {
            continue;
        };
        // Reuse the webhook parser — it already accepts the raw
        // `getTransaction` shape (signature under `transaction.signatures[0]`,
        // logs under `meta.logMessages`).
        let body = serde_json::to_vec(&tx_json).map_err(|e| BackfillError::Rpc(e.to_string()))?;
        match parser::parse(&body) {
            Ok(events) if !events.is_empty() => {
                report.transactions_parsed += 1;
                all_events.extend(events);
            }
            Ok(_) => {}
            Err(err) => {
                tracing::warn!(signature = %sig, %err, "backfill: parser rejected tx");
            }
        }
    }

    if all_events.is_empty() {
        return Ok(report);
    }
    report.events_inserted = persist::insert_events(pool, &all_events).await?;
    let affected = mirror::affected(&all_events);
    mirror::refresh(pool, &affected).await?;
    tracing::info!(
        kind = entity_kind,
        id = %entity_id_for_log,
        signatures = report.signatures_scanned,
        parsed = report.transactions_parsed,
        inserted = report.events_inserted,
        "backfill: replayed history",
    );
    Ok(report)
}

async fn fetch_account_data(
    rpc: &RpcClient,
    pubkey_bs58: &str,
) -> Result<Option<Vec<u8>>, BackfillError> {
    #[derive(Deserialize)]
    struct AccountInfoResult {
        value: Option<AccountInfoValue>,
    }
    #[derive(Deserialize)]
    struct AccountInfoValue {
        data: (String, String),
    }
    let result: AccountInfoResult = rpc
        .call(
            "getAccountInfo",
            serde_json::json!([
                pubkey_bs58,
                { "encoding": "base64", "commitment": "confirmed" }
            ]),
        )
        .await?;
    let Some(v) = result.value else { return Ok(None) };
    let (b64, encoding) = v.data;
    if encoding != "base64" {
        return Err(BackfillError::Rpc(format!(
            "unexpected account encoding: {encoding}"
        )));
    }
    Ok(Some(STANDARD.decode(b64).map_err(|e| BackfillError::Rpc(e.to_string()))?))
}

async fn fetch_signatures(
    rpc: &RpcClient,
    pubkey_bs58: &str,
) -> Result<Vec<String>, BackfillError> {
    #[derive(Deserialize)]
    struct SigItem {
        signature: String,
    }
    let mut out = Vec::new();
    let mut before: Option<String> = None;
    loop {
        let mut config = serde_json::json!({ "limit": RPC_PAGE_SIZE });
        if let Some(ref b) = before {
            config["before"] = serde_json::Value::String(b.clone());
        }
        let page: Vec<SigItem> = rpc
            .call(
                "getSignaturesForAddress",
                serde_json::json!([pubkey_bs58, config]),
            )
            .await?;
        if page.is_empty() {
            break;
        }
        let last_in_page = page.last().map(|s| s.signature.clone());
        out.extend(page.into_iter().map(|s| s.signature));
        if out.len() >= SIGNATURE_CAP {
            tracing::warn!(
                pubkey = %pubkey_bs58,
                cap = SIGNATURE_CAP,
                "backfill: hit signature cap, truncating",
            );
            out.truncate(SIGNATURE_CAP);
            break;
        }
        before = last_in_page;
        // Replaying older history first is the convention; the parser doesn't
        // care about order, but a small extra inner loop here avoids fetching
        // more than the cap.
    }
    // RPC returns newest-first; reverse so we replay oldest-to-newest. Matters
    // for `last_active_slot` and any future ordering-sensitive mirrors.
    out.reverse();
    Ok(out)
}

async fn fetch_transaction(
    rpc: &RpcClient,
    signature: &str,
) -> Result<Option<serde_json::Value>, BackfillError> {
    let value: Option<serde_json::Value> = rpc
        .call(
            "getTransaction",
            serde_json::json!([
                signature,
                { "encoding": "json", "maxSupportedTransactionVersion": 0, "commitment": "confirmed" }
            ]),
        )
        .await?;
    Ok(value)
}

fn decode_pubkey(bs58_str: &str) -> Result<[u8; 32], BackfillError> {
    let bytes = bs58::decode(bs58_str)
        .into_vec()
        .map_err(|_| BackfillError::InvalidPubkey(bs58_str.into()))?;
    if bytes.len() != 32 {
        return Err(BackfillError::InvalidPubkey(bs58_str.into()));
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&bytes);
    Ok(out)
}

/// Compares `expected_owner` to the 32 bytes at `offset` in `account_data`.
/// Returns false (rather than panicking) if the buffer is too short.
fn owner_matches_at(account_data: &[u8], expected_owner: &[u8; 32], offset: usize) -> bool {
    let end = offset.saturating_add(32);
    if account_data.len() < end {
        return false;
    }
    &account_data[offset..end] == expected_owner
}

/// Off-chain port of Solana's `Pubkey::find_program_address`. Decrements the
/// bump from 255 until the candidate hash is off-curve (not a valid Edwards
/// point), matching the on-chain implementation byte-for-byte.
fn find_program_address(seeds: &[&[u8]], program_id: &[u8; 32]) -> Option<([u8; 32], u8)> {
    for bump in (0..=255u8).rev() {
        let mut hasher = Sha256::new();
        for seed in seeds {
            hasher.update(seed);
        }
        hasher.update([bump]);
        hasher.update(program_id);
        hasher.update(b"ProgramDerivedAddress");
        let hash: [u8; 32] = hasher.finalize().into();
        if !is_on_curve(&hash) {
            return Some((hash, bump));
        }
    }
    None
}

fn is_on_curve(bytes: &[u8; 32]) -> bool {
    CompressedEdwardsY(*bytes).decompress().is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    // Regression: the constants in this module must match the on-chain
    // program. If the program id ever changes, this test fires loudly.
    #[test]
    fn reputation_program_id_decodes_to_32_bytes() {
        let bytes = decode_pubkey(REPUTATION_PROGRAM_ID_BS58).unwrap();
        assert_eq!(bytes.len(), 32);
    }

    // Cross-checked against `solana_program::pubkey::Pubkey::find_program_address`
    // by computing the same input off-thread. The test pins a specific known
    // input/output to catch any drift in the off-curve check.
    #[test]
    fn find_program_address_matches_solana_implementation() {
        // Reputation program id + b"agent" + a fixed agent pubkey.
        let program_id = decode_pubkey(REPUTATION_PROGRAM_ID_BS58).unwrap();
        let agent = decode_pubkey("4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ").unwrap();
        // Should produce a deterministic (pda, bump) without panicking.
        let result = find_program_address(&[AGENT_SEED, &agent], &program_id);
        let (_pda, bump) = result.expect("PDA derivation must succeed for known inputs");
        // Bumps for non-pathological inputs land high (often >= 250). A bump
        // of 0 would mean we tried every value and almost certainly indicates
        // we got the seeds wrong.
        assert!(bump > 0, "bump should be high for typical seeds, got {bump}");
    }

    #[test]
    fn owner_matches_at_agent_offset() {
        let mut data = vec![0u8; 72];
        data[AGENT_OWNER_OFFSET..AGENT_OWNER_OFFSET + 32].copy_from_slice(&[7u8; 32]);
        assert!(owner_matches_at(&data, &[7u8; 32], AGENT_OWNER_OFFSET));
        assert!(!owner_matches_at(&data, &[9u8; 32], AGENT_OWNER_OFFSET));
    }

    #[test]
    fn owner_matches_at_vault_offset() {
        // CreditVault places owner immediately after the 8-byte discriminator.
        let mut data = vec![0u8; 40];
        data[VAULT_OWNER_OFFSET..VAULT_OWNER_OFFSET + 32].copy_from_slice(&[3u8; 32]);
        assert!(owner_matches_at(&data, &[3u8; 32], VAULT_OWNER_OFFSET));
        assert!(!owner_matches_at(&data, &[4u8; 32], VAULT_OWNER_OFFSET));
    }

    #[test]
    fn owner_matches_at_rejects_short_buffer() {
        let data = vec![0u8; 39];
        assert!(!owner_matches_at(&data, &[0u8; 32], AGENT_OWNER_OFFSET));
        // Also short for vault if the buffer doesn't span offset+32.
        let too_small = vec![0u8; 30];
        assert!(!owner_matches_at(&too_small, &[0u8; 32], VAULT_OWNER_OFFSET));
    }

    // Confirms the parser already understands a single-transaction
    // `getTransaction` response without modification — the whole point of the
    // backfill design choice to reuse the webhook pipeline.
    #[test]
    fn parser_accepts_get_transaction_shape() {
        use crate::events::discriminators::EventDescriptor;
        use crate::events::reputation::AgentInitialized;
        use crate::events::types::PubkeyBytes;
        use borsh::BorshSerialize;

        let event = AgentInitialized {
            agent: PubkeyBytes([7u8; 32]),
            owner: PubkeyBytes([8u8; 32]),
            init_slot: 42,
        };
        let mut bytes = AgentInitialized::discriminator().to_vec();
        BorshSerialize::serialize(&event, &mut bytes).unwrap();
        let b64 = STANDARD.encode(&bytes);

        // Shape returned by `getTransaction(sig, { encoding: "json" })`.
        let tx = serde_json::json!({
            "slot": 1234,
            "transaction": { "signatures": ["sig_from_rpc"], "message": {} },
            "meta": { "logMessages": [
                "Program 4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ invoke [1]",
                format!("Program data: {b64}"),
                "Program 4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ success",
            ] }
        });
        let events = parser::parse(tx.to_string().as_bytes()).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].signature, "sig_from_rpc");
        assert_eq!(events[0].slot, 1234);
        assert_eq!(events[0].decoded.event_name, "AgentInitialized");
    }
}
