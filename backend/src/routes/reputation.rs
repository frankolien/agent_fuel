use actix_web::{web, HttpResponse, Responder};
use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::FromRow;

use crate::{score, state::AppState};

/// Public, service-facing reputation snapshot. Score is `Option<i32>` so
/// callers can distinguish "agent exists but has never had `compute_score`
/// run" from "agent has a current score of 0".
#[derive(Debug, Serialize)]
struct ReputationResponse {
    agent: String,
    score: Option<i32>,
    total_transactions: i64,
    total_volume_usdc: i64,
    services_used: i32,
    consecutive_success: i32,
    total_feedback_count: i32,
    active_negative_feedback_count: i32,
    last_active_slot: i64,
    updated_at: DateTime<Utc>,
}

#[derive(FromRow)]
struct AgentContext {
    total_transactions: i64,
    total_volume_usdc: i64,
    services_used: i32,
    consecutive_success: i32,
    total_feedback_count: i32,
    active_negative_feedback_count: i32,
    last_active_slot: i64,
    updated_at: DateTime<Utc>,
}

pub async fn lookup(state: web::Data<AppState>, path: web::Path<String>) -> impl Responder {
    let agent = path.into_inner();
    let context: sqlx::Result<Option<AgentContext>> = sqlx::query_as(
        "SELECT total_transactions, total_volume_usdc, services_used, consecutive_success, \
         total_feedback_count, active_negative_feedback_count, last_active_slot, updated_at \
         FROM agents WHERE pubkey = $1",
    )
    .bind(&agent)
    .fetch_optional(&state.pool)
    .await;

    let Ok(Some(ctx)) = context else {
        return match context {
            Ok(None) => HttpResponse::NotFound().finish(),
            Err(err) => {
                tracing::error!(error = %err, "reputation lookup failed");
                HttpResponse::InternalServerError().finish()
            }
            _ => unreachable!(),
        };
    };

    let score = match score::latest(&state.pool, &state.score_cache, &agent).await {
        Ok(s) => s,
        // Score read failure shouldn't blow up a public lookup — return the
        // agent's context with score=None so the caller knows the row exists
        // but the score is unavailable right now.
        Err(err) => {
            tracing::warn!(error = %err, agent, "score read failed; returning without score");
            None
        }
    };

    HttpResponse::Ok().json(ReputationResponse {
        agent,
        score,
        total_transactions: ctx.total_transactions,
        total_volume_usdc: ctx.total_volume_usdc,
        services_used: ctx.services_used,
        consecutive_success: ctx.consecutive_success,
        total_feedback_count: ctx.total_feedback_count,
        active_negative_feedback_count: ctx.active_negative_feedback_count,
        last_active_slot: ctx.last_active_slot,
        updated_at: ctx.updated_at,
    })
}
