use actix_web::web;

pub mod auth;
mod health;
mod webhooks;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(health::live)
        .service(health::ready)
        .service(webhooks::helius)
        .service(auth::nonce)
        .service(auth::verify);
}
