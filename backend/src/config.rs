use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    pub bind_addr: String,
    pub database_url: String,
    pub db_max_connections: u32,
    pub helius_webhook_secret: Option<String>,
    pub redis_url: Option<String>,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let bind_addr = env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:8080".to_string());
        let database_url =
            env::var("DATABASE_URL").map_err(|_| anyhow::anyhow!("DATABASE_URL is required"))?;
        let db_max_connections = env::var("DB_MAX_CONNECTIONS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(10);
        // `None` makes the webhook endpoint fail-closed (see routes::webhooks::verify).
        let helius_webhook_secret = env::var("HELIUS_WEBHOOK_SECRET")
            .ok()
            .filter(|s| !s.is_empty());
        // Redis is optional in dev; score reads fall back to Postgres when unset.
        let redis_url = env::var("REDIS_URL").ok().filter(|s| !s.is_empty());

        Ok(Self {
            bind_addr,
            database_url,
            db_max_connections,
            helius_webhook_secret,
            redis_url,
        })
    }
}
