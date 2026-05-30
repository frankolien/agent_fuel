use actix_governor::governor::middleware::NoOpMiddleware;
use actix_governor::{Governor, GovernorConfig, PeerIpKeyExtractor};
use actix_web::web;

use crate::dev_airdrop::DevAirdropHandle;

pub mod api;
pub mod auth;
mod health;
mod reputation;
mod webhooks;
mod ws;

#[derive(Clone, Copy)]
pub struct Limits {
    pub webhook_body_max_bytes: usize,
}

pub fn configure(
    cfg: &mut web::ServiceConfig,
    reputation_rate_limit: &GovernorConfig<PeerIpKeyExtractor, NoOpMiddleware>,
    limits: &Limits,
    dev_airdrop: Option<DevAirdropHandle>,
    dev_airdrop_rate_limit: &GovernorConfig<PeerIpKeyExtractor, NoOpMiddleware>,
) {
    cfg.service(health::live)
        .service(health::ready)
        .service(
            web::resource("/webhooks/helius")
                .app_data(web::PayloadConfig::new(limits.webhook_body_max_bytes))
                .route(web::post().to(webhooks::helius)),
        )
        .service(auth::nonce)
        .service(auth::verify)
        .service(ws::agent_stream)
        .service(ws::vault_stream)
        .service(ws::service_stream)
        .service(ws::alerts_stream)
        .service(
            web::resource("/reputation/{agent}")
                .wrap(Governor::new(reputation_rate_limit))
                .route(web::get().to(reputation::lookup)),
        );
    api::configure(cfg, dev_airdrop, dev_airdrop_rate_limit);
}
