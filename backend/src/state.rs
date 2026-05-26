use sqlx::PgPool;

use crate::score::ScoreCache;

pub struct AppState {
    pub pool: PgPool,
    pub helius_webhook_secret: Option<String>,
    pub score_cache: ScoreCache,
}
