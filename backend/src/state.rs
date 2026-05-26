// Shared application state injected into every handler via `web::Data`.

use sqlx::PgPool;

pub struct AppState {
    pub pool: PgPool,
    pub helius_webhook_secret: Option<String>,
}
