// Agent Fuel backend entrypoint.
//
// Phase 3 Slice 1: Actix-Web app skeleton with Postgres pool, sqlx-managed
// migrations on startup, and a liveness/readiness split health endpoint.
// Later slices add the Helius webhook receiver, event parser, mirror tables,
// score engine, SIWS auth, REST surfaces, the WebSocket stream, and FCM alerts.

use actix_web::{middleware, web, App, HttpServer};
use tracing_actix_web::TracingLogger;

mod config;
mod db;
mod routes;
mod state;

use config::Config;
use state::AppState;

#[actix_web::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    init_tracing();

    let cfg = Config::from_env()?;
    tracing::info!(bind = %cfg.bind_addr, "starting backend");

    let pool = db::connect(&cfg.database_url, cfg.db_max_connections).await?;
    db::run_migrations(&pool).await?;

    let state = web::Data::new(AppState { pool });
    let bind = cfg.bind_addr.clone();

    HttpServer::new(move || {
        App::new()
            .app_data(state.clone())
            .wrap(TracingLogger::default())
            .wrap(middleware::NormalizePath::trim())
            .configure(routes::configure)
    })
    .bind(&bind)?
    .run()
    .await?;

    Ok(())
}

fn init_tracing() {
    use tracing_subscriber::{fmt, EnvFilter};
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    fmt().with_env_filter(filter).with_target(false).init();
}
