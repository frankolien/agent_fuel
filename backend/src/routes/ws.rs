use std::time::Duration;

use actix_web::{get, web, HttpRequest, HttpResponse};
use futures_util::StreamExt;

use crate::state::AppState;
use crate::ws_hub::{agent_key, vault_key};

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);
const CLIENT_IDLE_TIMEOUT: Duration = Duration::from_secs(90);

#[get("/ws/agents/{pubkey}")]
pub async fn agent_stream(
    req: HttpRequest,
    body: web::Payload,
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> Result<HttpResponse, actix_web::Error> {
    let key = agent_key(&path.into_inner());
    serve_stream(req, body, &state, key).await
}

#[get("/ws/vaults/{pubkey}")]
pub async fn vault_stream(
    req: HttpRequest,
    body: web::Payload,
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> Result<HttpResponse, actix_web::Error> {
    let key = vault_key(&path.into_inner());
    serve_stream(req, body, &state, key).await
}

async fn serve_stream(
    req: HttpRequest,
    body: web::Payload,
    state: &web::Data<AppState>,
    channel_key: String,
) -> Result<HttpResponse, actix_web::Error> {
    let (response, mut session, mut msg_stream) = actix_ws::handle(&req, body)?;
    let mut rx = state.ws_hub.subscribe(&channel_key);

    actix_web::rt::spawn(async move {
        let mut last_pong = std::time::Instant::now();
        let mut heartbeat = tokio::time::interval(HEARTBEAT_INTERVAL);
        // Burn the immediate tick so we don't ping before the client has
        // finished its WS upgrade.
        heartbeat.tick().await;

        loop {
            tokio::select! {
                Some(payload) = rx.recv() => {
                    if session.text(payload).await.is_err() {
                        break;
                    }
                }
                msg = msg_stream.next() => {
                    match msg {
                        Some(Ok(actix_ws::Message::Ping(bytes))) => {
                            if session.pong(&bytes).await.is_err() { break; }
                        }
                        Some(Ok(actix_ws::Message::Pong(_))) => {
                            last_pong = std::time::Instant::now();
                        }
                        Some(Ok(actix_ws::Message::Close(_))) | None => break,
                        Some(Err(_)) => break,
                        _ => {}
                    }
                }
                _ = heartbeat.tick() => {
                    // Client hasn't ponged in 90s; drop so a half-open socket
                    // can't keep the subscriber alive forever.
                    if last_pong.elapsed() > CLIENT_IDLE_TIMEOUT { break; }
                    if session.ping(b"").await.is_err() { break; }
                }
            }
        }
        let _ = session.close(None).await;
    });

    Ok(response)
}
