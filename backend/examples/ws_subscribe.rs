// Subscribe to /ws/agents/<agent>, post an event via /webhooks/helius from a
// second tokio task, and print the live frame that arrives over the socket.

use std::time::Duration;

use agent_fuel_backend::events::discriminators::EventDescriptor;
use agent_fuel_backend::events::reputation::AgentInitialized;
use agent_fuel_backend::events::types::PubkeyBytes;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use borsh::BorshSerialize;
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::connect_async;
use tungstenite::Message;

const REPUTATION_PROGRAM: &str = "4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ";

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let helius_secret = std::env::var("HELIUS_WEBHOOK_SECRET")?;

    let agent_bytes = [0xAAu8; 32];
    let agent_b58 = bs58::encode(agent_bytes).into_string();
    let owner_bytes = [0xBBu8; 32];
    println!("subscribing to {agent_b58}");

    let url = format!("ws://127.0.0.1:8080/ws/agents/{agent_b58}");
    let (mut ws, _) = connect_async(&url).await?;
    println!("ws connected");

    let push_handle = tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(500)).await;
        let event = AgentInitialized {
            agent: PubkeyBytes(agent_bytes),
            owner: PubkeyBytes(owner_bytes),
            init_slot: 9999,
        };
        let mut bytes = AgentInitialized::discriminator().to_vec();
        BorshSerialize::serialize(&event, &mut bytes).unwrap();
        let b64 = STANDARD.encode(&bytes);
        let payload = serde_json::json!([{
            "signature": "ws_smoke_sig_001",
            "slot": 9999,
            "meta": { "logMessages": [
                format!("Program {REPUTATION_PROGRAM} invoke [1]"),
                format!("Program data: {b64}"),
                format!("Program {REPUTATION_PROGRAM} success")
            ] }
        }]);
        let client = ureq::AgentBuilder::new().build();
        client
            .post("http://127.0.0.1:8080/webhooks/helius")
            .set("Authorization", &helius_secret)
            .send_json(&payload)
            .unwrap();
        println!("posted webhook");
    });

    let deadline = tokio::time::sleep(Duration::from_secs(5));
    tokio::pin!(deadline);
    loop {
        tokio::select! {
            msg = ws.next() => match msg {
                Some(Ok(Message::Text(text))) => {
                    println!("\nws frame received:\n{text}");
                    break;
                }
                Some(Ok(Message::Ping(_))) => {}
                Some(Ok(other)) => println!("other frame: {other:?}"),
                Some(Err(e)) => { println!("ws error: {e}"); break; }
                None => break,
            },
            _ = &mut deadline => {
                println!("timeout: no frame in 5s");
                break;
            }
        }
    }
    push_handle.await?;
    let _ = ws.send(Message::Close(None)).await;
    Ok(())
}
