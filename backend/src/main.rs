use std::time::Duration;

use std::sync::Arc;

use actix_cors::Cors;
use actix_governor::GovernorConfigBuilder;
use actix_web::{http::header, middleware, web, App, HttpServer};
use agent_fuel_backend::{
    config::Config, db, notifier::LogNotifier, routes, routes::Limits, score, state::AppState,
};
use tracing_actix_web::TracingLogger;

const SCORE_SWEEP_INTERVAL: Duration = Duration::from_secs(300);

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

    let score_cache = score::ScoreCache::connect(cfg.redis_url.as_deref()).await;
    if !score_cache.is_enabled() {
        tracing::warn!("REDIS_URL unset or unreachable — score reads will hit Postgres every time");
    }

    {
        let pool = pool.clone();
        let cache = score_cache.clone();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(SCORE_SWEEP_INTERVAL);
            tick.tick().await; // burn the immediate first tick
            loop {
                tick.tick().await;
                match score::sweep(&pool, &cache).await {
                    Ok(n) if n > 0 => tracing::info!(refreshed = n, "score sweep"),
                    Ok(_) => {}
                    Err(err) => tracing::warn!(error = %err, "score sweep failed"),
                }
            }
        });
    }

    if cfg.jwt_secret.is_none() {
        tracing::warn!(
            "JWT_SECRET unset — /auth/verify fails closed and any AuthedPubkey-protected route returns 503"
        );
    }

    let rpc_client = cfg
        .solana_rpc_url
        .as_ref()
        .map(|url| Arc::new(agent_fuel_backend::backfill::RpcClient::new(url.clone())));
    if rpc_client.is_none() {
        tracing::warn!(
            "SOLANA_RPC_URL unset — /api/agents/{{pk}}/backfill returns 503 until configured"
        );
    }

    let state = web::Data::new(AppState {
        pool,
        helius_webhook_secret: cfg.helius_webhook_secret.clone(),
        score_cache,
        jwt_secret: cfg.jwt_secret.clone(),
        siws_domain: cfg.siws_domain.clone(),
        siws_chain_id: cfg.siws_chain_id.clone(),
        ws_hub: agent_fuel_backend::ws_hub::WsHub::default(),
        // LogNotifier is the dev default; a real FCM dispatcher slots in
        // here once FCM_SERVICE_ACCOUNT_JSON is provisioned.
        notifier: Arc::new(LogNotifier),
        rpc_client,
    });
    let bind = cfg.bind_addr.clone();
    let cors_origins = cfg.cors_allowed_origins.clone();
    let limits = Limits {
        webhook_body_max_bytes: cfg.webhook_body_max_bytes,
    };
    tracing::info!(origins = ?cors_origins, webhook_body_max_bytes = limits.webhook_body_max_bytes, "CORS + limits configured");

    // Built once so the underlying Arc<RateLimiter> is shared across all
    // worker threads — otherwise each worker has its own bucket and the
    // effective limit is N_workers × burst_size.
    let reputation_rate_limit = GovernorConfigBuilder::default()
        .seconds_per_request(1)
        .burst_size(20)
        .finish()
        .expect("static governor config");

    let server = HttpServer::new(move || {
        // `Cors` is rebuilt per worker — it's a cheap struct of vecs, and
        // origin matching happens on every request anyway.
        let mut cors = Cors::default()
            .allowed_methods(vec!["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
            .allowed_headers(vec![header::AUTHORIZATION, header::CONTENT_TYPE, header::ACCEPT])
            .supports_credentials()
            .max_age(3600);
        for origin in &cors_origins {
            cors = cors.allowed_origin(origin);
        }

        App::new()
            .app_data(state.clone())
            .wrap(cors)
            .wrap(TracingLogger::default())
            .wrap(middleware::NormalizePath::trim())
            .configure(|cfg| routes::configure(cfg, &reputation_rate_limit, &limits))
    })
    .bind(&bind)?
    // Workers finish in-flight requests before exiting on `handle.stop(true)`.
    // Pair with container `terminationGracePeriodSeconds` ≥ 35s.
    .shutdown_timeout(30)
    .run();

    let server_handle = server.handle();
    let server_task = tokio::spawn(server);

    wait_for_shutdown_signal().await;
    tracing::info!("shutdown signal received — draining in-flight requests");
    server_handle.stop(true).await;

    // Server's spawn-handle resolves once workers have drained.
    match server_task.await {
        Ok(Ok(())) => tracing::info!("server exited cleanly"),
        Ok(Err(err)) => tracing::error!(error = %err, "server exited with error"),
        Err(err) => tracing::error!(error = %err, "server task panicked"),
    }
    Ok(())
}

// Returns once SIGINT (ctrl-C) or SIGTERM (container stop) is observed.
// On non-unix this falls back to ctrl-C only.
async fn wait_for_shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};
        let mut sigterm = match signal(SignalKind::terminate()) {
            Ok(s) => s,
            Err(err) => {
                tracing::warn!(error = %err, "could not install SIGTERM handler — using SIGINT only");
                let _ = tokio::signal::ctrl_c().await;
                return;
            }
        };
        tokio::select! {
            _ = tokio::signal::ctrl_c() => tracing::info!("received SIGINT"),
            _ = sigterm.recv() => tracing::info!("received SIGTERM"),
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
        tracing::info!("received ctrl-c");
    }
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
