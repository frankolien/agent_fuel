// End-to-end SIWS dance against a running backend.
//   cargo run --example sign_siws_test
// Optional env: BACKEND_URL (defaults to http://127.0.0.1:8080).
//
// Generates a deterministic test keypair, hits /auth/nonce, signs the
// returned message, hits /auth/verify, and prints the JWT.

use ed25519_dalek::{Signer, SigningKey};
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct NonceReq {
    pubkey: String,
}

#[derive(Deserialize)]
struct NonceResp {
    nonce: String,
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
    let signing_key = SigningKey::from_bytes(&[42u8; 32]);
    let pubkey_bytes = signing_key.verifying_key().to_bytes();
    let pubkey = bs58::encode(pubkey_bytes).into_string();
    println!("pubkey: {pubkey}");

    let client = ureq::AgentBuilder::new().build();

    let nonce: NonceResp = client
        .post(&format!("{base}/auth/nonce"))
        .send_json(NonceReq {
            pubkey: pubkey.clone(),
        })?
        .into_json()?;
    println!("nonce: {}", nonce.nonce);
    println!("message:\n{}", nonce.message);

    let sig = signing_key.sign(nonce.message.as_bytes());
    let sig_b58 = bs58::encode(sig.to_bytes()).into_string();

    let verify: VerifyResp = client
        .post(&format!("{base}/auth/verify"))
        .send_json(VerifyReq {
            pubkey: pubkey.clone(),
            signature: sig_b58,
        })?
        .into_json()?;
    println!("\ntoken: {}", verify.token);
    println!("\ncurl -H 'Authorization: Bearer {}' …", verify.token);
    Ok(())
}
