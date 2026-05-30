use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    pub bind_addr: String,
    pub database_url: String,
    pub db_max_connections: u32,
    pub helius_webhook_secret: Option<String>,
    pub redis_url: Option<String>,
    pub jwt_secret: Option<String>,
    pub siws_domain: String,
    pub siws_chain_id: String,
    /// Origins allowed to call the API from a browser. Defaults to the local
    /// Vite dev server. Set `CORS_ALLOWED_ORIGINS` to a comma-separated list
    /// to allow more (e.g. `https://app.agent-fuel.io,https://staging.…`).
    pub cors_allowed_origins: Vec<String>,
    /// Maximum allowed body size for `/webhooks/helius` POSTs. Helius payloads
    /// for typical Solana txs are a few KB; the ceiling here bounds the
    /// indexer's exposure to oversized POSTs. Override with
    /// `WEBHOOK_BODY_MAX_BYTES`. Default: 2 MiB.
    pub webhook_body_max_bytes: usize,
    /// Solana JSON-RPC endpoint used for on-demand chain backfills. `None`
    /// disables the backfill endpoint with 503. Override with `SOLANA_RPC_URL`
    /// (e.g. a Helius RPC URL like `https://mainnet.helius-rpc.com/?api-key=…`).
    pub solana_rpc_url: Option<String>,
    /// Devnet dev-USDC mint pubkey (base58). Required to enable the
    /// `POST /api/dev/airdrop` route. Set with `AGENT_FUEL_USDC_MINT`.
    pub dev_airdrop_mint: Option<String>,
    /// Filesystem path to the mint authority keypair JSON. One of two ways
    /// to enable the `POST /api/dev/airdrop` route. Set with
    /// `AGENT_FUEL_USDC_MINT_AUTHORITY_PATH`. Cloud deploys (Railway, Render,
    /// Fly) should prefer `AGENT_FUEL_USDC_MINT_AUTHORITY_B64` instead.
    pub dev_airdrop_authority_path: Option<String>,
    /// Base64-encoded mint authority keypair — for cloud deploys that can't
    /// mount a file. Accepts either the raw 64 bytes base64'd, or the JSON
    /// byte-array form base64'd. Takes precedence over the file-path var if
    /// both are set. Production deploys MUST leave this unset.
    pub dev_airdrop_authority_b64: Option<String>,
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
        // `None` makes /auth/verify fail-closed (see routes::auth).
        let jwt_secret = env::var("JWT_SECRET").ok().filter(|s| !s.is_empty());
        let siws_domain =
            env::var("SIWS_DOMAIN").unwrap_or_else(|_| "agent-fuel.local".to_string());
        let siws_chain_id =
            env::var("SIWS_CHAIN_ID").unwrap_or_else(|_| "solana:devnet".to_string());

        let cors_allowed_origins = env::var("CORS_ALLOWED_ORIGINS")
            .ok()
            .filter(|s| !s.is_empty())
            .map(|s| s.split(',').map(|o| o.trim().to_string()).collect())
            .unwrap_or_else(|| vec!["http://localhost:5173".to_string()]);

        let webhook_body_max_bytes = env::var("WEBHOOK_BODY_MAX_BYTES")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(2 * 1024 * 1024);

        let solana_rpc_url = env::var("SOLANA_RPC_URL")
            .ok()
            .filter(|s| !s.is_empty());

        let dev_airdrop_mint = env::var("AGENT_FUEL_USDC_MINT")
            .ok()
            .filter(|s| !s.is_empty());
        let dev_airdrop_authority_path = env::var("AGENT_FUEL_USDC_MINT_AUTHORITY_PATH")
            .ok()
            .filter(|s| !s.is_empty());
        let dev_airdrop_authority_b64 = env::var("AGENT_FUEL_USDC_MINT_AUTHORITY_B64")
            .ok()
            .filter(|s| !s.is_empty());

        Ok(Self {
            bind_addr,
            database_url,
            db_max_connections,
            helius_webhook_secret,
            redis_url,
            jwt_secret,
            siws_domain,
            siws_chain_id,
            cors_allowed_origins,
            webhook_body_max_bytes,
            solana_rpc_url,
            dev_airdrop_mint,
            dev_airdrop_authority_path,
            dev_airdrop_authority_b64,
        })
    }
}
