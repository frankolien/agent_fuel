// Emits a Helius payload with a ScoreComputed event for smoke-testing the
// score pipeline (score_history insert + Redis cache).

use agent_fuel_backend::events::discriminators::EventDescriptor;
use agent_fuel_backend::events::reputation::ScoreComputed;
use agent_fuel_backend::events::types::PubkeyBytes;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use borsh::BorshSerialize;

const REPUTATION_PROGRAM: &str = "4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ";

fn main() {
    let score = std::env::args()
        .nth(1)
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(750);
    let slot = std::env::args()
        .nth(2)
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(300);

    let event = ScoreComputed {
        agent: PubkeyBytes([0xAA; 32]),
        score,
        slot,
    };
    let mut bytes = ScoreComputed::discriminator().to_vec();
    event.serialize(&mut bytes).unwrap();
    let b64 = STANDARD.encode(&bytes);

    let payload = serde_json::json!([{
        "signature": format!("score_sig_{slot}"),
        "slot": slot as i64,
        "meta": { "logMessages": [
            format!("Program {REPUTATION_PROGRAM} invoke [1]"),
            format!("Program data: {b64}"),
            format!("Program {REPUTATION_PROGRAM} success")
        ] }
    }]);
    println!("{}", serde_json::to_string_pretty(&payload).unwrap());
}
