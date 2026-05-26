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
    load_dotenv();
    init_tracing();

    let cfg = Config::from_env()?;
    tracing::info!(bind = %cfg.bind_addr, db = %redact_db_url(&cfg.database_url), "starting backend");

    let pool = db::connect(&cfg.database_url, cfg.db_max_connections).await?;
    db::run_migrations(&pool).await?;

    if cfg.helius_webhook_secret.is_none() {
        tracing::warn!(
            "HELIUS_WEBHOOK_SECRET not set — /webhooks/helius will fail-closed on every request"
        );
    }

    let state = web::Data::new(AppState {
        pool,
        helius_webhook_secret: cfg.helius_webhook_secret.clone(),
    });
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

// `cargo run -p agent_fuel_backend` invokes the binary with the backend
// package directory as CWD, while a `cargo run` from the repo root invokes
// with the workspace root. `dotenvy::dotenv()` only searches CWD, so a single
// repo-root `.env` was being missed when run via `-p`. We try the repo root
// explicitly (one level up from the package dir), then fall back to `dotenv()`
// for any other layout.
fn load_dotenv() {
    if dotenvy::from_filename("../.env").is_ok() {
        return;
    }
    let _ = dotenvy::dotenv();
}

// Strip credentials before logging — the URL otherwise leaks the password.
fn redact_db_url(url: &str) -> String {
    if let Some(rest) = url.strip_prefix("postgres://") {
        if let Some(at) = rest.find('@') {
            return format!("postgres://***@{}", &rest[at + 1..]);
        }
    }
    url.to_string()
}
