// Prints a Helius-shaped payload with one valid Anchor-encoded event for
// piping into curl against /webhooks/helius.

use agent_fuel_backend::events::discriminators::EventDescriptor;
use agent_fuel_backend::events::reputation::AgentInitialized;
use agent_fuel_backend::events::types::PubkeyBytes;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use borsh::BorshSerialize;

const PROGRAM_ID: &str = "4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ";

fn main() {
    let event = AgentInitialized {
        agent: PubkeyBytes([0xAA; 32]),
        owner: PubkeyBytes([0xBB; 32]),
        init_slot: 9_999,
    };
    let mut bytes = AgentInitialized::discriminator().to_vec();
    event.serialize(&mut bytes).unwrap();
    let b64 = STANDARD.encode(&bytes);

    let payload = serde_json::json!([{
        "signature": "smoke_test_sig_002",
        "slot": 42,
        "meta": {
            "logMessages": [
                format!("Program {PROGRAM_ID} invoke [1]"),
                "Program log: initialize_agent",
                format!("Program data: {b64}"),
                format!("Program {PROGRAM_ID} success"),
            ]
        }
    }]);
    println!("{}", serde_json::to_string_pretty(&payload).unwrap());
}
