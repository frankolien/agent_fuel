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
        return rpc_unavailable();
    };
    let report =
        backfill::backfill_agent(&state.pool, rpc.as_ref(), &agent_pubkey, &caller.0).await;
    map_report("agent", &agent_pubkey, report)
}

#[post("/api/vaults/{pubkey}/backfill")]
pub async fn vault(
    state: web::Data<AppState>,
    caller: AuthedPubkey,
    path: web::Path<String>,
) -> impl Responder {
    let vault_pubkey = path.into_inner();
    let Some(rpc) = state.rpc_client.as_ref() else {
        return rpc_unavailable();
    };
    let report =
        backfill::backfill_vault(&state.pool, rpc.as_ref(), &vault_pubkey, &caller.0).await;
    map_report("vault", &vault_pubkey, report)
}

fn rpc_unavailable() -> HttpResponse {
    // Unconfigured RPC means we'd otherwise misreport "doesn't exist on chain"
    // for accounts we just can't see — fail loudly so the operator notices.
    HttpResponse::ServiceUnavailable().body("backfill unavailable: SOLANA_RPC_URL not configured")
}

fn map_report(
    kind: &'static str,
    pubkey: &str,
    report: Result<backfill::BackfillReport, BackfillError>,
) -> HttpResponse {
    match report {
        Ok(r) => HttpResponse::Ok().json(r),
        // The caller already proved knowledge of the pubkey, so 404 here doesn't
        // leak ownership info beyond what `/reputation/{pk}` already exposes.
        Err(BackfillError::AgentNotFound) => HttpResponse::NotFound().finish(),
        Err(BackfillError::OwnerMismatch) => {
            HttpResponse::Forbidden().body(format!("not the {kind} owner"))
        }
        Err(BackfillError::InvalidPubkey(_)) => HttpResponse::BadRequest().body("invalid pubkey"),
        Err(err) => {
            tracing::error!(kind, %pubkey, error = %err, "backfill failed");
            HttpResponse::InternalServerError().finish()
        }
    }
}
