use actix_web::web;

mod health;
mod webhooks;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(health::live)
        .service(health::ready)
        .service(webhooks::helius);
}
