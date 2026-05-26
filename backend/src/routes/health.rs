// Split live/ready so a DB blip drains the instance from a load balancer
// without tripping the container platform's restart loop.

use actix_web::{get, web, HttpResponse, Responder};
use serde::Serialize;

use crate::state::AppState;

#[derive(Serialize)]
struct Status {
    status: &'static str,
}

#[get("/health/live")]
pub async fn live() -> impl Responder {
    HttpResponse::Ok().json(Status { status: "ok" })
}

#[get("/health/ready")]
pub async fn ready(state: web::Data<AppState>) -> impl Responder {
    match sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.pool)
        .await
    {
        Ok(_) => HttpResponse::Ok().json(Status { status: "ok" }),
        Err(err) => {
            tracing::warn!(error = %err, "readiness check failed");
            HttpResponse::ServiceUnavailable().json(Status {
                status: "db_unreachable",
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::{test, App};

    #[actix_web::test]
    async fn live_returns_ok_status() {
        let app = test::init_service(App::new().service(live)).await;
        let req = test::TestRequest::get().uri("/health/live").to_request();
        let resp: serde_json::Value = test::call_and_read_body_json(&app, req).await;
        assert_eq!(resp["status"], "ok");
    }
}
