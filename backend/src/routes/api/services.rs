// Public list of all registered services. No auth required — the on-chain
// registry is public, so the read view should be too. Used by the console's
// Services screen and the vault-policy whitelist picker.

use actix_web::{get, web, HttpResponse, Responder};
use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::FromRow;

use crate::state::AppState;

#[derive(Debug, Serialize, FromRow)]
pub struct ServiceRow {
    pub pubkey: String,
    pub name: String,
    pub category: i16,
    pub active: bool,
    pub init_slot: i64,
    pub total_agents_served: i32,
    pub total_volume_received_usdc: i64,
    pub last_active_slot: i64,
    pub updated_at: DateTime<Utc>,
}

#[get("/api/services")]
pub async fn list(state: web::Data<AppState>) -> impl Responder {
    let rows: sqlx::Result<Vec<ServiceRow>> = sqlx::query_as(
        "SELECT pubkey, name, category, active, init_slot, total_agents_served, \
         total_volume_received_usdc, last_active_slot, updated_at \
         FROM services ORDER BY total_volume_received_usdc DESC",
    )
    .fetch_all(&state.pool)
    .await;
    match rows {
        Ok(rows) => HttpResponse::Ok().json(rows),
        Err(err) => {
            tracing::error!(error = %err, "services list failed");
            HttpResponse::InternalServerError().finish()
        }
    }
}
