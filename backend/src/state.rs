use sqlx::PgPool;

use std::sync::Arc;

use crate::backfill::RpcClient;
use crate::notifier::Notifier;
use crate::score::ScoreCache;
use crate::ws_hub::WsHub;

pub struct AppState {
    pub pool: PgPool,
    pub helius_webhook_secret: Option<String>,
    pub score_cache: ScoreCache,
    pub jwt_secret: Option<String>,
    pub siws_domain: String,
    pub siws_chain_id: String,
    pub ws_hub: WsHub,
    pub notifier: Arc<dyn Notifier>,
    /// `None` when `SOLANA_RPC_URL` is unset — backfill endpoint responds 503
    /// in that case rather than panicking.
    pub rpc_client: Option<Arc<RpcClient>>,
}
