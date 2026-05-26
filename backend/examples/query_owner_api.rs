// End-to-end smoke: seed an agent owned by a test wallet, run the SIWS dance,
// and hit /api/agents with the resulting JWT. Requires the backend, Postgres,
// and Redis to be running.

use agent_fuel_backend::events::discriminators::EventDescriptor;
use agent_fuel_backend::events::reputation::AgentInitialized;
use agent_fuel_backend::events::types::PubkeyBytes;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use borsh::BorshSerialize;
use ed25519_dalek::{Signer, SigningKey};
use serde::{Deserialize, Serialize};

const REPUTATION_PROGRAM: &str = "4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ";

#[derive(Serialize)]
struct NonceReq {
    pubkey: String,
}
#[derive(Deserialize)]
struct NonceResp {
    message: String,
}
#[derive(Serialize)]
struct VerifyReq {
    pubkey: String,
    signature: String,
}
#[derive(Deserialize)]
struct VerifyResp {
    token: String,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let base = std::env::var("BACKEND_URL").unwrap_or_else(|_| "http://127.0.0.1:8080".into());
    let helius_secret = std::env::var("HELIUS_WEBHOOK_SECRET")?;
    let client = ureq::AgentBuilder::new().build();

    let signing_key = SigningKey::from_bytes(&[42u8; 32]);
    let owner_pubkey = signing_key.verifying_key().to_bytes();
    let owner_b58 = bs58::encode(owner_pubkey).into_string();
    let agent_pubkey = [0xAAu8; 32];
    let agent_b58 = bs58::encode(agent_pubkey).into_string();
    println!("owner: {owner_b58}");
    println!("agent: {agent_b58}");

    let event = AgentInitialized {
        agent: PubkeyBytes(agent_pubkey),
        owner: PubkeyBytes(owner_pubkey),
        init_slot: 1,
    };
    let mut bytes = AgentInitialized::discriminator().to_vec();
    BorshSerialize::serialize(&event, &mut bytes)?;
    let b64 = STANDARD.encode(&bytes);
    let payload = serde_json::json!([{
        "signature": format!("owner_api_smoke_{owner_b58}"),
        "slot": 1,
        "meta": { "logMessages": [
            format!("Program {REPUTATION_PROGRAM} invoke [1]"),
            format!("Program data: {b64}"),
            format!("Program {REPUTATION_PROGRAM} success")
        ] }
    }]);
    client
        .post(&format!("{base}/webhooks/helius"))
        .set("Authorization", &helius_secret)
        .send_json(&payload)?;
    println!("seeded AgentInitialized");

    let nonce: NonceResp = client
        .post(&format!("{base}/auth/nonce"))
        .send_json(NonceReq {
            pubkey: owner_b58.clone(),
        })?
        .into_json()?;
    let sig = signing_key.sign(nonce.message.as_bytes());
    let verify: VerifyResp = client
        .post(&format!("{base}/auth/verify"))
        .send_json(VerifyReq {
            pubkey: owner_b58.clone(),
            signature: bs58::encode(sig.to_bytes()).into_string(),
        })?
        .into_json()?;
    println!("got JWT");

    let agents_body = client
        .get(&format!("{base}/api/agents"))
        .set("Authorization", &format!("Bearer {}", verify.token))
        .call()?
        .into_string()?;
    println!("\nGET /api/agents:\n{agents_body}");

    let detail_body = client
        .get(&format!("{base}/api/agents/{agent_b58}"))
        .set("Authorization", &format!("Bearer {}", verify.token))
        .call()?
        .into_string()?;
    println!("\nGET /api/agents/{agent_b58}:\n{detail_body}");

    println!("\nGET /api/agents (no auth) — expect 401:");
    match client.get(&format!("{base}/api/agents")).call() {
        Ok(_) => println!("  unexpected 200"),
        Err(ureq::Error::Status(c, _)) => println!("  status: {c}"),
        Err(e) => println!("  error: {e}"),
    }
    Ok(())
}
