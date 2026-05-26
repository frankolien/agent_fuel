use actix_web::{get, web, HttpResponse, Responder};
use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::FromRow;

use crate::routes::api::pagination::Cursor;
use crate::routes::auth::AuthedPubkey;
use crate::state::AppState;

#[derive(Debug, Serialize, FromRow)]
pub struct AgentRow {
    pub pubkey: String,
    pub owner: String,
    pub init_slot: i64,
    pub score: i32,
    pub total_transactions: i64,
    pub total_volume_usdc: i64,
    pub services_used: i32,
    pub consecutive_success: i32,
    pub total_feedback_count: i32,
    pub active_negative_feedback_count: i32,
    pub last_active_slot: i64,
    pub updated_at: DateTime<Utc>,
}

#[get("/api/agents")]
pub async fn list(state: web::Data<AppState>, caller: AuthedPubkey) -> impl Responder {
    let rows: sqlx::Result<Vec<AgentRow>> = sqlx::query_as(
        "SELECT pubkey, owner, init_slot, score, total_transactions, total_volume_usdc, \
         services_used, consecutive_success, total_feedback_count, active_negative_feedback_count, \
         last_active_slot, updated_at \
         FROM agents WHERE owner = $1 ORDER BY last_active_slot DESC",
    )
    .bind(&caller.0)
    .fetch_all(&state.pool)
    .await;
    match rows {
        Ok(rows) => HttpResponse::Ok().json(rows),
        Err(err) => {
            tracing::error!(error = %err, "agents list failed");
            HttpResponse::InternalServerError().finish()
        }
    }
}

#[get("/api/agents/{pubkey}")]
pub async fn detail(
    state: web::Data<AppState>,
    caller: AuthedPubkey,
    path: web::Path<String>,
) -> impl Responder {
    let agent = path.into_inner();
    let row: sqlx::Result<Option<AgentRow>> = sqlx::query_as(
        "SELECT pubkey, owner, init_slot, score, total_transactions, total_volume_usdc, \
         services_used, consecutive_success, total_feedback_count, active_negative_feedback_count, \
         last_active_slot, updated_at \
         FROM agents WHERE pubkey = $1 AND owner = $2",
    )
    .bind(&agent)
    .bind(&caller.0)
    .fetch_optional(&state.pool)
    .await;
    match row {
        Ok(Some(row)) => HttpResponse::Ok().json(row),
        // 404 covers both "doesn't exist" and "exists but not yours" so an
        // attacker can't probe for agents they don't own.
        Ok(None) => HttpResponse::NotFound().finish(),
        Err(err) => {
            tracing::error!(error = %err, "agents detail failed");
            HttpResponse::InternalServerError().finish()
        }
    }
}

#[derive(Debug, Serialize, FromRow)]
pub struct EventRow {
    pub signature: String,
    pub log_index: i32,
    pub slot: i64,
    pub program_id: String,
    pub event_name: String,
    pub payload: serde_json::Value,
    pub received_at: DateTime<Utc>,
}

#[get("/api/agents/{pubkey}/activity")]
pub async fn activity(
    state: web::Data<AppState>,
    caller: AuthedPubkey,
    path: web::Path<String>,
    cursor: web::Query<Cursor>,
) -> impl Responder {
    let agent = path.into_inner();
    if !owns_agent(&state.pool, &agent, &caller.0)
        .await
        .unwrap_or(false)
    {
        return HttpResponse::NotFound().finish();
    }
    let rows: sqlx::Result<Vec<EventRow>> = sqlx::query_as(
        "SELECT signature, log_index, slot, program_id, event_name, payload, received_at \
         FROM events \
         WHERE payload @> jsonb_build_object('agent', $1::text) \
           AND ($2::bigint IS NULL OR slot < $2) \
         ORDER BY slot DESC, log_index DESC \
         LIMIT $3",
    )
    .bind(&agent)
    .bind(cursor.before_slot)
    .bind(cursor.limit())
    .fetch_all(&state.pool)
    .await;
    match rows {
        Ok(rows) => HttpResponse::Ok().json(rows),
        Err(err) => {
            tracing::error!(error = %err, "agent activity failed");
            HttpResponse::InternalServerError().finish()
        }
    }
}

#[derive(Debug, Serialize, FromRow)]
pub struct ScorePoint {
    pub score: i32,
    pub slot: i64,
    pub recorded_at: DateTime<Utc>,
}

#[get("/api/agents/{pubkey}/score/history")]
pub async fn score_history(
    state: web::Data<AppState>,
    caller: AuthedPubkey,
    path: web::Path<String>,
    cursor: web::Query<Cursor>,
) -> impl Responder {
    let agent = path.into_inner();
    if !owns_agent(&state.pool, &agent, &caller.0)
        .await
        .unwrap_or(false)
    {
        return HttpResponse::NotFound().finish();
    }
    let rows: sqlx::Result<Vec<ScorePoint>> = sqlx::query_as(
        "SELECT score, slot, recorded_at FROM score_history \
         WHERE agent = $1 AND ($2::bigint IS NULL OR slot < $2) \
         ORDER BY slot DESC LIMIT $3",
    )
    .bind(&agent)
    .bind(cursor.before_slot)
    .bind(cursor.limit())
    .fetch_all(&state.pool)
    .await;
    match rows {
        Ok(rows) => HttpResponse::Ok().json(rows),
        Err(err) => {
            tracing::error!(error = %err, "score history failed");
            HttpResponse::InternalServerError().finish()
        }
    }
}

async fn owns_agent(pool: &sqlx::PgPool, agent: &str, owner: &str) -> sqlx::Result<bool> {
    let row: Option<(bool,)> =
        sqlx::query_as("SELECT TRUE FROM agents WHERE pubkey = $1 AND owner = $2")
            .bind(agent)
            .bind(owner)
            .fetch_optional(pool)
            .await?;
    Ok(row.is_some())
}
