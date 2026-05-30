// One-shot dashboard seed for local-dev: registers a service, initializes an
// agent + vault under the supplied owner wallet, deposits funds, fires a
// burst of spends + a score sample. Drives the real ingest pipeline
// (webhook → parser → mirror → score → WS → alerts), so the dashboard at
// http://localhost:5173/console shows real rows + live activity.
//
// Usage:
//   cargo run -p agent_fuel_backend --example seed_dashboard -- <OWNER_WALLET_B58> [BACKEND_URL]
//
// The owner wallet is the pubkey you sign in with via SIWS. BACKEND_URL
// defaults to http://localhost:8080. HELIUS_WEBHOOK_SECRET is read from env.

use std::env;

use agent_fuel_backend::events::discriminators::EventDescriptor;
use agent_fuel_backend::events::reputation::{
    AgentInitialized, PaymentRecorded, ScoreComputed, ServiceRegistered,
};
use agent_fuel_backend::events::types::{Hash32, NameBytes, PubkeyBytes};
use agent_fuel_backend::events::vault::{Deposited, PolicyUpdated, Spent, VaultCreated};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use borsh::BorshSerialize;
use serde_json::{json, Value};

const REPUTATION_PROGRAM: &str = "4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ";
const CREDIT_VAULT_PROGRAM: &str = "EsykPsafhHUeN7jA9DGqBiGuBsTBaFynLDVVpE4jFXDg";
const USDC_MINT_DEVNET: &str = "EMm5UveNWJaTfbMcJ8g2w7i2riydKKyZWhauEj8DzRTq";

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Mirror main.rs: examples run with CWD=backend/ where `.env` isn't, so
    // try the repo root first, then fall back to dotenvy's own up-walk.
    let _ = dotenvy::from_filename("../.env").or_else(|_| dotenvy::dotenv());

    let mut args = env::args().skip(1);
    let owner_b58 = args
        .next()
        .ok_or("missing owner wallet pubkey (arg 1) — pass the wallet you SIWS in with")?;
    let backend = args
        .next()
        .unwrap_or_else(|| "http://localhost:8080".to_string());
    let secret = env::var("HELIUS_WEBHOOK_SECRET")
        .map_err(|_| "HELIUS_WEBHOOK_SECRET must be set (matches backend's webhook auth)")?;

    let owner = pubkey_from_b58(&owner_b58)?;

    // Deterministic-ish fake pubkeys derived from the owner so reruns hit the
    // same rows (UPSERT semantics keep this idempotent).
    let agent = derive(&owner, *b"agent_____________");
    let vault = derive(&owner, *b"vault_____________");
    let vault_ata = derive(&owner, *b"vault_token_acct__");
    let service = derive(&owner, *b"service_pyth______");

    let endpoint = format!("{}/webhooks/helius", backend.trim_end_matches('/'));
    let agent_b58 = bs58::encode(agent.0).into_string();
    let vault_b58 = bs58::encode(vault.0).into_string();
    eprintln!("Seeding dashboard for owner {}", owner_b58);
    eprintln!("  agent  pubkey: {}", agent_b58);
    eprintln!("  vault  pubkey: {}", vault_b58);
    eprintln!("  endpoint:      {}", endpoint);
    eprintln!();

    // 1) Register a service the agent will spend on.
    let mut name = [0u8; 32];
    name[..4].copy_from_slice(b"Pyth");
    post(
        &endpoint,
        &secret,
        rep_payload(
            "svc_pyth_reg",
            100,
            &ServiceRegistered { service: service.clone(), name: NameBytes(name), category: 1, init_slot: 100 },
        ),
        "ServiceRegistered",
    )?;

    // 2) Initialize the agent under this owner.
    post(
        &endpoint,
        &secret,
        rep_payload(
            "agent_init_sig",
            105,
            &AgentInitialized { agent: agent.clone(), owner: owner.clone(), init_slot: 105 },
        ),
        "AgentInitialized",
    )?;

    // 3) Create + fund the vault, then attach a policy.
    let usdc_mint = pubkey_from_b58(USDC_MINT_DEVNET)?;
    post(
        &endpoint,
        &secret,
        vault_payload(
            "vault_create_sig",
            110,
            &VaultCreated {
                vault: vault.clone(),
                owner: owner.clone(),
                agent: agent.clone(),
                usdc_mint,
                vault_token_account: vault_ata,
                slot: 110,
            },
        ),
        "VaultCreated",
    )?;

    let deposited_amount: u64 = 5_000_000_000; // 5000 USDC (6 decimals)
    post(
        &endpoint,
        &secret,
        vault_payload(
            "vault_deposit_sig",
            111,
            &Deposited {
                vault: vault.clone(),
                owner: owner.clone(),
                amount_usdc: deposited_amount,
                new_total_deposited: deposited_amount,
                slot: 111,
            },
        ),
        "Deposited",
    )?;

    let whitelist = whitelist_with(&service);
    post(
        &endpoint,
        &secret,
        vault_payload(
            "vault_policy_sig",
            112,
            &PolicyUpdated {
                vault: vault.clone(),
                owner: owner.clone(),
                per_tx_limit_usdc: 25_000_000, // 25 USDC
                hourly_limit_usdc: 240_000_000, // 240 USDC
                lifetime_limit_usdc: 5_000_000_000, // 5000 USDC
                allow_post_pay: true,
                whitelist,
                slot: 112,
            },
        ),
        "PolicyUpdated",
    )?;

    // 4) Fire 8 spends, accumulating new_total_spent so the mirror updates.
    let mut total_spent: u64 = 0;
    for i in 0..8 {
        let amount: u64 = 4_200 + (i as u64) * 11_000; // micro-USDC
        total_spent += amount;
        let slot = 200 + i as u64 * 4;
        post(
            &endpoint,
            &secret,
            both_payload(
                &format!("spend_{i}_sig"),
                slot,
                &Spent {
                    vault: vault.clone(),
                    agent: agent.clone(),
                    service: service.clone(),
                    amount_usdc: amount,
                    new_total_spent: total_spent,
                    slot,
                },
                CREDIT_VAULT_PROGRAM,
            ),
            &format!("Spent {amount} micro-USDC"),
        )?;
        // Reputation program emits PaymentRecorded as a side-effect of spend.
        post(
            &endpoint,
            &secret,
            rep_payload(
                &format!("pay_{i}_sig"),
                slot,
                &PaymentRecorded {
                    agent: agent.clone(),
                    service: service.clone(),
                    amount_usdc: amount,
                    payment_receipt_hash: Hash32(hash_seed(i as u64)),
                    was_new_pair: i == 0,
                    slot,
                },
            ),
            "PaymentRecorded",
        )?;
    }

    // 5) Compute a score so the agent isn't stuck at "unscored".
    post(
        &endpoint,
        &secret,
        rep_payload(
            "score_seed_sig",
            300,
            &ScoreComputed { agent: agent.clone(), score: 812, slot: 300 },
        ),
        "ScoreComputed → 812",
    )?;

    eprintln!();
    eprintln!("✓ Seed complete. Open http://localhost:5173/console and sign in with {}.", owner_b58);
    eprintln!("  Re-run any time — UPSERTs make it idempotent.");
    Ok(())
}

// ---- helpers ----

fn pubkey_from_b58(s: &str) -> Result<PubkeyBytes, String> {
    let bytes = bs58::decode(s)
        .into_vec()
        .map_err(|e| format!("invalid base58 pubkey {s}: {e}"))?;
    if bytes.len() != 32 {
        return Err(format!("pubkey {s} decoded to {} bytes, expected 32", bytes.len()));
    }
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes);
    Ok(PubkeyBytes(arr))
}

// Deterministic derivation: XOR the owner with a 32-byte tag. Not a real PDA,
// just a stable fake pubkey for seeding.
fn derive(owner: &PubkeyBytes, tag: [u8; 18]) -> PubkeyBytes {
    let mut out = owner.0;
    for (i, b) in tag.iter().enumerate() {
        out[i] ^= b;
    }
    PubkeyBytes(out)
}

fn whitelist_with(service: &PubkeyBytes) -> [PubkeyBytes; 8] {
    let zero = PubkeyBytes([0u8; 32]);
    [
        service.clone(),
        zero.clone(),
        zero.clone(),
        zero.clone(),
        zero.clone(),
        zero.clone(),
        zero.clone(),
        zero,
    ]
}

fn hash_seed(i: u64) -> [u8; 32] {
    let mut h = [0u8; 32];
    h[0] = i as u8;
    h[1] = (i >> 8) as u8;
    h
}

fn encode<T: BorshSerialize + EventDescriptor>(event: &T) -> String {
    let mut bytes = T::discriminator().to_vec();
    BorshSerialize::serialize(event, &mut bytes).unwrap();
    STANDARD.encode(&bytes)
}

fn rep_payload<T: BorshSerialize + EventDescriptor>(sig: &str, slot: u64, event: &T) -> Value {
    helius_envelope(sig, slot, encode(event), REPUTATION_PROGRAM)
}

fn vault_payload<T: BorshSerialize + EventDescriptor>(sig: &str, slot: u64, event: &T) -> Value {
    helius_envelope(sig, slot, encode(event), CREDIT_VAULT_PROGRAM)
}

fn both_payload<T: BorshSerialize + EventDescriptor>(
    sig: &str,
    slot: u64,
    event: &T,
    program: &str,
) -> Value {
    helius_envelope(sig, slot, encode(event), program)
}

fn helius_envelope(sig: &str, slot: u64, b64: String, program: &str) -> Value {
    json!([{
        "signature": sig,
        "slot": slot as i64,
        "meta": { "logMessages": [
            format!("Program {program} invoke [1]"),
            format!("Program data: {b64}"),
            format!("Program {program} success"),
        ]}
    }])
}

fn post(endpoint: &str, secret: &str, payload: Value, label: &str) -> Result<(), String> {
    let resp = ureq::post(endpoint)
        .set("Authorization", secret)
        .set("Content-Type", "application/json")
        .send_string(&payload.to_string())
        .map_err(|e| format!("{label}: request failed: {e}"))?;
    let status = resp.status();
    if status != 202 {
        return Err(format!("{label}: backend returned HTTP {status}"));
    }
    eprintln!("  ✓ {label}");
    Ok(())
}
