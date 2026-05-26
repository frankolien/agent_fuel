use actix_web::{get, web, HttpResponse, Responder};
use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::FromRow;

use crate::routes::api::agents::EventRow;
use crate::routes::api::pagination::Cursor;
use crate::routes::auth::AuthedPubkey;
use crate::state::AppState;

#[derive(Debug, Serialize, FromRow)]
pub struct VaultRow {
    pub pubkey: String,
    pub owner: String,
    pub agent: String,
    pub usdc_mint: String,
    pub vault_token_account: String,
    pub total_deposited: i64,
    pub total_withdrawn: i64,
    pub total_spent: i64,
    pub total_claimed: i64,
    pub frozen: bool,
    pub per_tx_limit_usdc: i64,
    pub hourly_limit_usdc: i64,
    pub lifetime_limit_usdc: i64,
    pub allow_post_pay: bool,
    pub created_slot: i64,
    pub last_active_slot: i64,
    pub updated_at: DateTime<Utc>,
}

#[get("/api/vaults")]
pub async fn list(state: web::Data<AppState>, caller: AuthedPubkey) -> impl Responder {
    let rows: sqlx::Result<Vec<VaultRow>> = sqlx::query_as(
        "SELECT pubkey, owner, agent, usdc_mint, vault_token_account, total_deposited, \
         total_withdrawn, total_spent, total_claimed, frozen, per_tx_limit_usdc, \
         hourly_limit_usdc, lifetime_limit_usdc, allow_post_pay, created_slot, last_active_slot, \
         updated_at \
         FROM vaults WHERE owner = $1 ORDER BY last_active_slot DESC",
    )
    .bind(&caller.0)
    .fetch_all(&state.pool)
    .await;
    match rows {
        Ok(rows) => HttpResponse::Ok().json(rows),
        Err(err) => {
            tracing::error!(error = %err, "vaults list failed");
            HttpResponse::InternalServerError().finish()
        }
    }
}

#[get("/api/vaults/{pubkey}")]
pub async fn detail(
    state: web::Data<AppState>,
    caller: AuthedPubkey,
    path: web::Path<String>,
) -> impl Responder {
    let vault = path.into_inner();
    let row: sqlx::Result<Option<VaultRow>> = sqlx::query_as(
        "SELECT pubkey, owner, agent, usdc_mint, vault_token_account, total_deposited, \
         total_withdrawn, total_spent, total_claimed, frozen, per_tx_limit_usdc, \
         hourly_limit_usdc, lifetime_limit_usdc, allow_post_pay, created_slot, last_active_slot, \
         updated_at \
         FROM vaults WHERE pubkey = $1 AND owner = $2",
    )
    .bind(&vault)
    .bind(&caller.0)
    .fetch_optional(&state.pool)
    .await;
    match row {
        Ok(Some(row)) => HttpResponse::Ok().json(row),
        Ok(None) => HttpResponse::NotFound().finish(),
        Err(err) => {
            tracing::error!(error = %err, "vaults detail failed");
            HttpResponse::InternalServerError().finish()
        }
    }
}

#[get("/api/vaults/{pubkey}/activity")]
pub async fn activity(
    state: web::Data<AppState>,
    caller: AuthedPubkey,
    path: web::Path<String>,
    cursor: web::Query<Cursor>,
) -> impl Responder {
    let vault = path.into_inner();
    if !owns_vault(&state.pool, &vault, &caller.0)
        .await
        .unwrap_or(false)
    {
        return HttpResponse::NotFound().finish();
    }
    let rows: sqlx::Result<Vec<EventRow>> = sqlx::query_as(
        "SELECT signature, log_index, slot, program_id, event_name, payload, received_at \
         FROM events \
         WHERE payload @> jsonb_build_object('vault', $1::text) \
           AND ($2::bigint IS NULL OR slot < $2) \
         ORDER BY slot DESC, log_index DESC \
         LIMIT $3",
    )
    .bind(&vault)
    .bind(cursor.before_slot)
    .bind(cursor.limit())
    .fetch_all(&state.pool)
    .await;
    match rows {
        Ok(rows) => HttpResponse::Ok().json(rows),
        Err(err) => {
            tracing::error!(error = %err, "vault activity failed");
            HttpResponse::InternalServerError().finish()
        }
    }
}

async fn owns_vault(pool: &sqlx::PgPool, vault: &str, owner: &str) -> sqlx::Result<bool> {
    let row: Option<(bool,)> =
        sqlx::query_as("SELECT TRUE FROM vaults WHERE pubkey = $1 AND owner = $2")
            .bind(vault)
            .bind(owner)
            .fetch_optional(pool)
            .await?;
    Ok(row.is_some())
}
