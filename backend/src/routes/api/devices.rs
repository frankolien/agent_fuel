use actix_web::{delete, post, web, HttpResponse, Responder};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use crate::routes::auth::AuthedPubkey;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub fcm_token: String,
    pub platform: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct DeviceRow {
    pub id: i64,
    pub owner: String,
    pub fcm_token: String,
    pub platform: String,
    pub registered_at: DateTime<Utc>,
    pub last_seen_at: DateTime<Utc>,
}

#[post("/api/devices")]
pub async fn register(
    state: web::Data<AppState>,
    caller: AuthedPubkey,
    body: web::Json<RegisterRequest>,
) -> impl Responder {
    // Re-registering the same token is idempotent and refreshes last_seen_at
    // so clients can use it as a heartbeat.
    let row: sqlx::Result<DeviceRow> = sqlx::query_as(
        "INSERT INTO device_tokens (owner, fcm_token, platform) \
         VALUES ($1, $2, $3) \
         ON CONFLICT (owner, fcm_token) DO UPDATE \
         SET last_seen_at = now(), platform = EXCLUDED.platform \
         RETURNING id, owner, fcm_token, platform, registered_at, last_seen_at",
    )
    .bind(&caller.0)
    .bind(&body.fcm_token)
    .bind(&body.platform)
    .fetch_one(&state.pool)
    .await;
    match row {
        Ok(r) => HttpResponse::Ok().json(r),
        Err(err) => {
            tracing::error!(error = %err, "device register failed");
            HttpResponse::InternalServerError().finish()
        }
    }
}

#[delete("/api/devices/{id}")]
pub async fn unregister(
    state: web::Data<AppState>,
    caller: AuthedPubkey,
    path: web::Path<i64>,
) -> impl Responder {
    let id = path.into_inner();
    // The `AND owner = $2` clause makes the delete a no-op for tokens
    // belonging to another wallet — same 404 either way, no existence leak.
    let result = sqlx::query("DELETE FROM device_tokens WHERE id = $1 AND owner = $2")
        .bind(id)
        .bind(&caller.0)
        .execute(&state.pool)
        .await;
    match result {
        Ok(r) if r.rows_affected() > 0 => HttpResponse::NoContent().finish(),
        Ok(_) => HttpResponse::NotFound().finish(),
        Err(err) => {
            tracing::error!(error = %err, "device unregister failed");
            HttpResponse::InternalServerError().finish()
        }
    }
}
