use actix_governor::governor::middleware::NoOpMiddleware;
use actix_governor::{Governor, GovernorConfig, PeerIpKeyExtractor};
use actix_web::web;

use crate::dev_airdrop::DevAirdropHandle;

pub mod agents;
pub mod alerts;
pub mod backfill;
pub mod dev;
pub mod devices;
pub mod pagination;
pub mod services;
pub mod spends;
pub mod vaults;

pub fn configure(
    cfg: &mut web::ServiceConfig,
    dev_airdrop: Option<DevAirdropHandle>,
    dev_airdrop_rate_limit: &GovernorConfig<PeerIpKeyExtractor, NoOpMiddleware>,
) {
    cfg.service(agents::list)
        .service(agents::detail)
        .service(agents::activity)
        .service(agents::score_history)
        .service(backfill::agent)
        .service(backfill::vault)
        .service(vaults::list)
        .service(vaults::detail)
        .service(vaults::activity)
        .service(services::list)
        .service(devices::register)
        .service(devices::unregister)
        .service(alerts::list)
        .service(alerts::unread_count)
        .service(alerts::mark_read)
        .service(alerts::mark_all_read)
        .service(spends::request)
        .service(spends::approve)
        .service(spends::reject);

    if let Some(handle) = dev_airdrop {
        cfg.app_data(web::Data::new(handle)).service(
            web::resource("/api/dev/airdrop")
                .wrap(Governor::new(dev_airdrop_rate_limit))
                .route(web::post().to(dev::airdrop)),
        );
    }
}
