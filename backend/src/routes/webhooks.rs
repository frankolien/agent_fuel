use actix_web::{http::header, post, web, HttpRequest, HttpResponse, Responder};
use subtle::ConstantTimeEq;

use crate::{parser, persist, state::AppState};

#[post("/webhooks/helius")]
pub async fn helius(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Bytes,
) -> impl Responder {
    let presented = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if let Some(early) = verify(state.helius_webhook_secret.as_deref(), presented) {
        return early;
    }

    match parser::parse(&body) {
        Ok(events) if events.is_empty() => {
            tracing::info!(
                bytes = body.len(),
                "accepted webhook: no decodable events in payload"
            );
            HttpResponse::Accepted().finish()
        }
        Ok(events) => match persist::insert_events(&state.pool, &events).await {
            Ok(inserted) => {
                tracing::info!(
                    parsed = events.len(),
                    inserted,
                    bytes = body.len(),
                    "persisted Helius webhook events"
                );
                HttpResponse::Accepted().finish()
            }
            // 500 keeps Helius retrying; the events table is source of truth.
            Err(err) => {
                tracing::error!(error = %err, "failed to persist webhook events");
                HttpResponse::InternalServerError().finish()
            }
        },
        // 400 stops Helius retries on payloads that can't ever be parsed.
        Err(err) => {
            tracing::warn!(error = %err, bytes = body.len(), "rejecting webhook: parse error");
            HttpResponse::BadRequest().finish()
        }
    }
}

// Returns the early HTTP response if auth fails, or `None` to proceed.
fn verify(expected: Option<&str>, presented: &str) -> Option<HttpResponse> {
    // Fail closed when the secret is unset — otherwise any caller could
    // post arbitrary events into the indexer.
    let Some(expected) = expected else {
        tracing::error!("rejecting webhook: HELIUS_WEBHOOK_SECRET not configured");
        return Some(HttpResponse::ServiceUnavailable().finish());
    };
    if !secret_matches(presented, expected) {
        tracing::warn!(
            presented_len = presented.len(),
            "rejecting webhook: bad Authorization header"
        );
        return Some(HttpResponse::Unauthorized().finish());
    }
    None
}

// `ct_eq` on different-length byte slices runs in constant time relative to
// the shorter input; we don't treat secret length as sensitive.
fn secret_matches(presented: &str, expected: &str) -> bool {
    presented.as_bytes().ct_eq(expected.as_bytes()).into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::http::StatusCode;

    #[test]
    fn matches_when_equal() {
        assert!(secret_matches("hunter2", "hunter2"));
    }

    #[test]
    fn mismatch_on_different_content() {
        assert!(!secret_matches("hunter2", "hunter3"));
    }

    #[test]
    fn mismatch_on_different_length() {
        assert!(!secret_matches("hunter", "hunter2"));
        assert!(!secret_matches("hunter22", "hunter2"));
    }

    #[test]
    fn mismatch_on_empty_presented() {
        assert!(!secret_matches("", "hunter2"));
    }

    #[test]
    fn verify_503_when_secret_unconfigured() {
        let resp = verify(None, "anything").unwrap();
        assert_eq!(resp.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[test]
    fn verify_401_on_missing_header() {
        let resp = verify(Some("hunter2"), "").unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn verify_401_on_wrong_secret() {
        let resp = verify(Some("hunter2"), "nope").unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn verify_returns_none_on_good_secret() {
        assert!(verify(Some("hunter2"), "hunter2").is_none());
    }
}
