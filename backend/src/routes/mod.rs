// Top-level route registration. New surfaces (webhooks, REST, WS) hang off
// `configure` so `main.rs` never grows route wiring of its own.

use actix_web::web;

mod health;
mod webhooks;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(health::live)
        .service(health::ready)
        .service(webhooks::helius);
}
