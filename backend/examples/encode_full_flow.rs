// Emits a multi-event Helius payload (register service + record payments)
// for smoke-testing the mirror refresh.

use agent_fuel_backend::events::discriminators::EventDescriptor;
use agent_fuel_backend::events::reputation::{PaymentRecorded, ServiceRegistered};
use agent_fuel_backend::events::types::{Hash32, NameBytes, PubkeyBytes};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use borsh::BorshSerialize;

const REPUTATION_PROGRAM: &str = "4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ";

fn encode<T: BorshSerialize + EventDescriptor>(event: &T) -> String {
    let mut bytes = T::discriminator().to_vec();
    event.serialize(&mut bytes).unwrap();
    STANDARD.encode(&bytes)
}

fn main() {
    let agent = PubkeyBytes([0xAA; 32]);
    let service = PubkeyBytes([0xCC; 32]);

    let mut name_bytes = [0u8; 32];
    name_bytes[..6].copy_from_slice(b"oracle");
    let service_reg = ServiceRegistered {
        service: service.clone(),
        name: NameBytes(name_bytes),
        category: 0,
        init_slot: 100,
    };

    let pay1 = PaymentRecorded {
        agent: agent.clone(),
        service: service.clone(),
        amount_usdc: 1_000_000,
        payment_receipt_hash: Hash32([1u8; 32]),
        was_new_pair: true,
        slot: 200,
    };
    let pay2 = PaymentRecorded {
        agent: agent.clone(),
        service: service.clone(),
        amount_usdc: 2_500_000,
        payment_receipt_hash: Hash32([2u8; 32]),
        was_new_pair: false,
        slot: 201,
    };

    let payload = serde_json::json!([
        {
            "signature": "service_reg_sig",
            "slot": 100,
            "meta": { "logMessages": [
                format!("Program {REPUTATION_PROGRAM} invoke [1]"),
                format!("Program data: {}", encode(&service_reg)),
                format!("Program {REPUTATION_PROGRAM} success")
            ] }
        },
        {
            "signature": "payment_1_sig",
            "slot": 200,
            "meta": { "logMessages": [
                format!("Program {REPUTATION_PROGRAM} invoke [1]"),
                format!("Program data: {}", encode(&pay1)),
                format!("Program {REPUTATION_PROGRAM} success")
            ] }
        },
        {
            "signature": "payment_2_sig",
            "slot": 201,
            "meta": { "logMessages": [
                format!("Program {REPUTATION_PROGRAM} invoke [1]"),
                format!("Program data: {}", encode(&pay2)),
                format!("Program {REPUTATION_PROGRAM} success")
            ] }
        }
    ]);
    println!("{}", serde_json::to_string_pretty(&payload).unwrap());
}
