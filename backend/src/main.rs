use actix_web::{middleware, web, App, HttpServer};
use agent_fuel_backend::{config::Config, db, routes, state::AppState};
use tracing_actix_web::TracingLogger;

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

// `cargo run -p agent_fuel_backend` sets CWD to backend/, where `.env`
// doesn't live; try the repo root first, then fall back to dotenvy's
// own up-walk for any other layout.
fn load_dotenv() {
    if dotenvy::from_filename("../.env").is_ok() {
        return;
    }
    let _ = dotenvy::dotenv();
}

fn redact_db_url(url: &str) -> String {
    if let Some(rest) = url.strip_prefix("postgres://") {
        if let Some(at) = rest.find('@') {
            return format!("postgres://***@{}", &rest[at + 1..]);
        }
    }
    url.to_string()
}
