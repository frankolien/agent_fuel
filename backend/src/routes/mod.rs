use actix_governor::governor::middleware::NoOpMiddleware;
use actix_governor::{Governor, GovernorConfig, PeerIpKeyExtractor};
use actix_web::web;

pub mod api;
pub mod auth;
mod health;
mod reputation;
mod webhooks;

pub fn configure(
    cfg: &mut web::ServiceConfig,
    reputation_rate_limit: &GovernorConfig<PeerIpKeyExtractor, NoOpMiddleware>,
) {
    cfg.service(health::live)
        .service(health::ready)
        .service(webhooks::helius)
        .service(auth::nonce)
        .service(auth::verify)
        .service(
            web::resource("/reputation/{agent}")
                .wrap(Governor::new(reputation_rate_limit))
                .route(web::get().to(reputation::lookup)),
        );
    api::configure(cfg);
}
