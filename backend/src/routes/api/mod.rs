use actix_web::web;

pub mod agents;
pub mod backfill;
pub mod devices;
pub mod pagination;
pub mod services;
pub mod vaults;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(agents::list)
        .service(agents::detail)
        .service(agents::activity)
        .service(agents::score_history)
        .service(backfill::agent)
        .service(vaults::list)
        .service(vaults::detail)
        .service(vaults::activity)
        .service(services::list)
        .service(devices::register)
        .service(devices::unregister);
}
