use actix_web::{post, web, HttpResponse, Responder};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::FromRow;

use crate::alerts;
use crate::notifier::{Alert, AlertKind, AlertSeverity};
use crate::routes::auth::AuthedPubkey;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct RequestSpendBody {
    pub agent: String,
    pub vault: String,
    pub service: String,
    /// Micro-USDC (1e-6).
    pub amount_usdc: i64,
    pub reason: SpendReason,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SpendReason {
    PerTxExceeded,
    HourlyExceeded,
    LifetimeExceeded,
}

impl SpendReason {
    fn as_str(self) -> &'static str {
        match self {
            SpendReason::PerTxExceeded => "per_tx_exceeded",
            SpendReason::HourlyExceeded => "hourly_exceeded",
            SpendReason::LifetimeExceeded => "lifetime_exceeded",
        }
    }
    fn human(self) -> &'static str {
        match self {
            SpendReason::PerTxExceeded => "per-tx limit",
            SpendReason::HourlyExceeded => "hourly limit",
            SpendReason::LifetimeExceeded => "lifetime cap",
        }
    }
}

#[derive(Debug, Serialize, FromRow)]
pub struct PendingSpendRow {
    pub id: i64,
    pub owner: String,
    pub agent: String,
    pub vault: String,
    pub service: String,
    pub amount_usdc: i64,
    pub reason: String,
    pub status: String,
    pub alert_id: Option<i64>,
    pub created_at: DateTime<Utc>,
    pub decided_at: Option<DateTime<Utc>>,
}

/// Called by the agent runtime (or its proxy) when a spend attempt would
/// exceed the vault's policy. We store the request, fire an urgent alert
/// so the mobile Alerts tab + bell badge update in real time, and respond
/// with the row id so the caller can poll `/api/spends/:id` for the verdict.
///
/// Auth is by AuthedPubkey — for now we require the caller's wallet ==
/// `vault.owner`. A future hardening lets the agent itself authenticate
/// (signed by agent keypair) so the agent runtime can request approvals
/// without holding the owner's JWT, but that needs an agent-auth extractor
/// we don't have yet.
#[post("/api/spends/request")]
pub async fn request(
    state: web::Data<AppState>,
    caller: AuthedPubkey,
    body: web::Json<RequestSpendBody>,
) -> impl Responder {
    let req = body.into_inner();
    if req.amount_usdc <= 0 {
        return HttpResponse::BadRequest().body("amount_usdc must be > 0");
    }

    // Verify the caller owns the vault. We don't want a wallet creating
    // pending spends on someone else's vault.
    let vault_owner: sqlx::Result<Option<(String,)>> = sqlx::query_as(
        "SELECT owner FROM vaults WHERE pubkey = $1",
    )
    .bind(&req.vault)
    .fetch_optional(&state.pool)
    .await;
    let owner = match vault_owner {
        Ok(Some((owner,))) if owner == caller.0 => owner,
        Ok(_) => return HttpResponse::NotFound().finish(),
        Err(err) => {
            tracing::error!(error = %err, "spends request vault lookup failed");
            return HttpResponse::InternalServerError().finish();
        }
    };

    let insert: sqlx::Result<(i64,)> = sqlx::query_as(
        "INSERT INTO pending_spends \
            (owner, agent, vault, service, amount_usdc, reason) \
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    )
    .bind(&owner)
    .bind(&req.agent)
    .bind(&req.vault)
    .bind(&req.service)
    .bind(req.amount_usdc)
    .bind(req.reason.as_str())
    .fetch_one(&state.pool)
    .await;
    let pending_id = match insert {
        Ok((id,)) => id,
        Err(err) => {
            tracing::error!(error = %err, "spends request insert failed");
            return HttpResponse::InternalServerError().finish();
        }
    };

    let usdc = req.amount_usdc as f64 / 1_000_000.0;
    let alert = Alert {
        owner: owner.clone(),
        kind: AlertKind::ApprovalRequired,
        severity: AlertSeverity::Urgent,
        title: format!("Approval required · {usdc:.2} USDC spend"),
        body: format!(
            "{} wants to pay {usdc:.2} USDC to {} — above the {}.",
            short(&req.agent),
            short(&req.service),
            req.reason.human()
        ),
        data: json!({
            "pending_spend_id": pending_id,
            "agent": req.agent,
            "vault": req.vault,
            "service": req.service,
            "amount_usdc_lamports": req.amount_usdc,
            "amount_usdc": usdc,
            "reason": req.reason.as_str(),
        }),
    };
    let alert_id = match alerts::emit(
        &state.pool,
        state.notifier.as_ref(),
        &state.ws_hub,
        alert,
    )
    .await
    {
        Ok(id) => id,
        Err(err) => {
            tracing::error!(
                error = %err,
                pending_spend = pending_id,
                "spends request alert emit failed"
            );
            return HttpResponse::InternalServerError().finish();
        }
    };

    if let Err(err) = sqlx::query(
        "UPDATE pending_spends SET alert_id = $1 WHERE id = $2",
    )
    .bind(alert_id)
    .bind(pending_id)
    .execute(&state.pool)
    .await
    {
        // Best effort — the alert is already stored and dispatched, this is
        // just for back-reference. Don't fail the request.
        tracing::warn!(error = %err, pending_spend = pending_id, "alert backref failed");
    }

    HttpResponse::Created().json(json!({
        "pending_spend_id": pending_id,
        "alert_id": alert_id,
        "status": "pending",
    }))
}

#[derive(Debug, Serialize)]
pub struct DecideResponse {
    pub id: i64,
    pub status: String,
}

#[post("/api/spends/{id}/approve")]
pub async fn approve(
    state: web::Data<AppState>,
    caller: AuthedPubkey,
    path: web::Path<i64>,
) -> impl Responder {
    decide(&state, caller, path.into_inner(), "approved").await
}

#[post("/api/spends/{id}/reject")]
pub async fn reject(
    state: web::Data<AppState>,
    caller: AuthedPubkey,
    path: web::Path<i64>,
) -> impl Responder {
    decide(&state, caller, path.into_inner(), "rejected").await
}

async fn decide(
    state: &web::Data<AppState>,
    caller: AuthedPubkey,
    id: i64,
    new_status: &'static str,
) -> HttpResponse {
    // Single-shot update: only flips a row that is still pending AND owned by
    // the caller. Returning the row tells us whether the update applied.
    let row: sqlx::Result<Option<(String, Option<i64>)>> = sqlx::query_as(
        "UPDATE pending_spends \
         SET status = $1, decided_at = now() \
         WHERE id = $2 AND owner = $3 AND status = 'pending' \
         RETURNING status, alert_id",
    )
    .bind(new_status)
    .bind(id)
    .bind(&caller.0)
    .fetch_optional(&state.pool)
    .await;
    let (status, alert_id) = match row {
        Ok(Some((status, alert_id))) => (status, alert_id),
        Ok(None) => return HttpResponse::NotFound().finish(),
        Err(err) => {
            tracing::error!(error = %err, "spends decide failed");
            return HttpResponse::InternalServerError().finish();
        }
    };

    // Mark the linked alert as read so the bell badge clears in the same
    // round-trip.
    if let Some(alert_id) = alert_id {
        if let Err(err) = sqlx::query(
            "UPDATE alerts SET read_at = now() \
             WHERE id = $1 AND owner = $2 AND read_at IS NULL",
        )
        .bind(alert_id)
        .bind(&caller.0)
        .execute(&state.pool)
        .await
        {
            tracing::warn!(error = %err, alert = alert_id, "alert auto-read failed");
        }
    }

    HttpResponse::Ok().json(DecideResponse { id, status })
}

fn short(pk: &str) -> String {
    if pk.len() <= 8 {
        pk.to_string()
    } else {
        format!("{}…{}", &pk[..4], &pk[pk.len() - 4..])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reason_round_trip() {
        assert_eq!(SpendReason::PerTxExceeded.as_str(), "per_tx_exceeded");
        assert_eq!(SpendReason::HourlyExceeded.as_str(), "hourly_exceeded");
        assert_eq!(SpendReason::LifetimeExceeded.as_str(), "lifetime_exceeded");
    }

    #[test]
    fn short_truncates() {
        assert_eq!(short("AxMZj6QvN5VxRTpzdBcEwFHvuJxV3TA64"), "AxMZ…TA64");
        assert_eq!(short("abc"), "abc");
    }
}
