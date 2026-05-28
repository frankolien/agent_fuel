//! Owner-gated on-demand backfill for agents created during a broken-webhook
//! window. Replays on-chain history through the same pipeline the live
//! webhook uses, so the resulting DB state is identical.

use actix_web::{post, web, HttpResponse, Responder};

use crate::backfill::{self, BackfillError};
use crate::routes::auth::AuthedPubkey;
use crate::state::AppState;

#[post("/api/agents/{pubkey}/backfill")]
pub async fn agent(
    state: web::Data<AppState>,
    caller: AuthedPubkey,
    path: web::Path<String>,
) -> impl Responder {
    let agent_pubkey = path.into_inner();

    let Some(rpc) = state.rpc_client.as_ref() else {
        // Unconfigured RPC means we'd otherwise misreport "agent doesn't exist
        // on chain" — fail loudly so the operator notices.
        return HttpResponse::ServiceUnavailable().body(
            "backfill unavailable: SOLANA_RPC_URL not configured",
        );
    };

    let report = backfill::backfill_agent(&state.pool, rpc.as_ref(), &agent_pubkey, &caller.0).await;
    match report {
        Ok(r) => HttpResponse::Ok().json(r),
        // 404 covers both "no on-chain account" and (separately) "agent doesn't
        // exist" — the caller already proved knowledge of the pubkey, so this
        // doesn't leak ownership info.
        Err(BackfillError::AgentNotFound) => HttpResponse::NotFound().finish(),
        // Distinguish ownership rejection so the UI can tell the user they
        // need to switch wallets.
        Err(BackfillError::OwnerMismatch) => HttpResponse::Forbidden().body("not the agent owner"),
        Err(BackfillError::InvalidPubkey(_)) => HttpResponse::BadRequest().body("invalid pubkey"),
        Err(err) => {
            tracing::error!(%agent_pubkey, error = %err, "backfill failed");
            HttpResponse::InternalServerError().finish()
        }
    }
}
