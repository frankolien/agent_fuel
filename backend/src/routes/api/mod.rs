use actix_web::web;

pub mod agents;
pub mod alerts;
pub mod backfill;
pub mod devices;
pub mod pagination;
pub mod services;
pub mod spends;
pub mod vaults;

pub fn configure(cfg: &mut web::ServiceConfig) {
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
}
