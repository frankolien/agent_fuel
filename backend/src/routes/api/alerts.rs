use actix_web::{get, post, web, HttpResponse, Responder};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use crate::routes::auth::AuthedPubkey;
use crate::state::AppState;

const DEFAULT_LIMIT: i64 = 50;
const MAX_LIMIT: i64 = 200;

#[derive(Debug, Serialize, FromRow)]
pub struct AlertRow {
    pub id: i64,
    pub owner: String,
    pub kind: String,
    pub severity: String,
    pub title: String,
    pub body: String,
    pub data: serde_json::Value,
    pub read_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

/// `?limit=N&before_id=X&unread=true` — id-based cursor; new alerts always
/// arrive at the head so id-DESC pagination is stable.
#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub limit: Option<i64>,
    pub before_id: Option<i64>,
    pub unread: Option<bool>,
}

impl ListQuery {
    fn limit(&self) -> i64 {
        self.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT)
    }
}

#[get("/api/alerts")]
pub async fn list(
    state: web::Data<AppState>,
    caller: AuthedPubkey,
    query: web::Query<ListQuery>,
) -> impl Responder {
    let limit = query.limit();
    let before_id = query.before_id.unwrap_or(i64::MAX);
    let only_unread = query.unread.unwrap_or(false);

    let result: sqlx::Result<Vec<AlertRow>> = if only_unread {
        sqlx::query_as(
            "SELECT id, owner, kind, severity, title, body, data, read_at, created_at \
             FROM alerts \
             WHERE owner = $1 AND id < $2 AND read_at IS NULL \
             ORDER BY id DESC LIMIT $3",
        )
        .bind(&caller.0)
        .bind(before_id)
        .bind(limit)
        .fetch_all(&state.pool)
        .await
    } else {
        sqlx::query_as(
            "SELECT id, owner, kind, severity, title, body, data, read_at, created_at \
             FROM alerts \
             WHERE owner = $1 AND id < $2 \
             ORDER BY id DESC LIMIT $3",
        )
        .bind(&caller.0)
        .bind(before_id)
        .bind(limit)
        .fetch_all(&state.pool)
        .await
    };

    match result {
        Ok(rows) => HttpResponse::Ok().json(rows),
        Err(err) => {
            tracing::error!(error = %err, "alerts list failed");
            HttpResponse::InternalServerError().finish()
        }
    }
}

#[derive(Debug, Serialize)]
pub struct UnreadCount {
    pub unread: i64,
}

#[get("/api/alerts/unread-count")]
pub async fn unread_count(
    state: web::Data<AppState>,
    caller: AuthedPubkey,
) -> impl Responder {
    let row: sqlx::Result<(i64,)> = sqlx::query_as(
        "SELECT COUNT(*) FROM alerts WHERE owner = $1 AND read_at IS NULL",
    )
    .bind(&caller.0)
    .fetch_one(&state.pool)
    .await;
    match row {
        Ok((unread,)) => HttpResponse::Ok().json(UnreadCount { unread }),
        Err(err) => {
            tracing::error!(error = %err, "alerts unread count failed");
            HttpResponse::InternalServerError().finish()
        }
    }
}

#[post("/api/alerts/{id}/read")]
pub async fn mark_read(
    state: web::Data<AppState>,
    caller: AuthedPubkey,
    path: web::Path<i64>,
) -> impl Responder {
    let id = path.into_inner();
    // Owner check inline so a 404 covers both "doesn't exist" and "not yours".
    let res = sqlx::query(
        "UPDATE alerts SET read_at = now() \
         WHERE id = $1 AND owner = $2 AND read_at IS NULL",
    )
    .bind(id)
    .bind(&caller.0)
    .execute(&state.pool)
    .await;
    match res {
        Ok(r) if r.rows_affected() == 0 => {
            // Either already read, doesn't exist, or owner mismatch — treat
            // all three the same to avoid leaking existence.
            HttpResponse::NotFound().finish()
        }
        Ok(_) => HttpResponse::NoContent().finish(),
        Err(err) => {
            tracing::error!(error = %err, alert = id, "alerts mark_read failed");
            HttpResponse::InternalServerError().finish()
        }
    }
}

#[derive(Debug, Serialize)]
pub struct MarkAllResponse {
    pub marked: u64,
}

#[post("/api/alerts/read-all")]
pub async fn mark_all_read(
    state: web::Data<AppState>,
    caller: AuthedPubkey,
) -> impl Responder {
    let res = sqlx::query(
        "UPDATE alerts SET read_at = now() \
         WHERE owner = $1 AND read_at IS NULL",
    )
    .bind(&caller.0)
    .execute(&state.pool)
    .await;
    match res {
        Ok(r) => HttpResponse::Ok().json(MarkAllResponse {
            marked: r.rows_affected(),
        }),
        Err(err) => {
            tracing::error!(error = %err, "alerts mark_all_read failed");
            HttpResponse::InternalServerError().finish()
        }
    }
}
