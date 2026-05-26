// Posts a Spent event to /webhooks/helius. Args: <vault_b58> <new_total_spent> <slot>.

use agent_fuel_backend::events::discriminators::EventDescriptor;
use agent_fuel_backend::events::types::PubkeyBytes;
use agent_fuel_backend::events::vault::Spent;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use borsh::BorshSerialize;

const CREDIT_VAULT_PROGRAM: &str = "EsykPsafhHUeN7jA9DGqBiGuBsTBaFynLDVVpE4jFXDg";

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    let vault_b58 = args
        .get(1)
        .cloned()
        .unwrap_or_else(|| "VAULT_DEFAULT".into());
    let new_total: u64 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);
    let slot: u64 = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(0);

    let mut vault_bytes = [0u8; 32];
    let decoded = bs58::decode(&vault_b58).into_vec().unwrap_or_default();
    if decoded.len() == 32 {
        vault_bytes.copy_from_slice(&decoded);
    }

    let event = Spent {
        vault: PubkeyBytes(vault_bytes),
        agent: PubkeyBytes([0xAB; 32]),
        service: PubkeyBytes([0xCD; 32]),
        amount_usdc: new_total,
        new_total_spent: new_total,
        slot,
    };
    let mut bytes = Spent::discriminator().to_vec();
    BorshSerialize::serialize(&event, &mut bytes)?;
    let b64 = STANDARD.encode(&bytes);
    let payload = serde_json::json!([{
        "signature": format!("spent_sig_{slot}"),
        "slot": slot as i64,
        "meta": { "logMessages": [
            format!("Program {CREDIT_VAULT_PROGRAM} invoke [1]"),
            format!("Program data: {b64}"),
            format!("Program {CREDIT_VAULT_PROGRAM} success"),
        ] }
    }]);
    println!("{}", serde_json::to_string(&payload).unwrap());
    Ok(())
}
