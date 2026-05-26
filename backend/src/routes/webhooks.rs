// Helius enhanced-webhook receiver.
//
// Phase 3 Slice 2: verify the shared-secret header in constant time and log
// the payload. Slice 3.3 introduces the parser that decodes payloads into
// rows in `events`; until then this endpoint exists to (a) let us configure
// the Helius webhook at the dashboard, (b) validate the auth path under real
// traffic, and (c) catch payload-shape surprises early via tracing.
//
// Helius signs requests with a static shared secret presented in the
// `Authorization` header (raw string, no scheme prefix, no HMAC). We compare
// in constant time so a probing attacker can't time-attack the secret one
// byte at a time.

use actix_web::{http::header, post, web, HttpRequest, HttpResponse, Responder};
use subtle::ConstantTimeEq;

use crate::state::AppState;

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
    verify_and_log(state.helius_webhook_secret.as_deref(), presented, &body)
}

// Split out so the auth + dispatch logic is unit-testable without standing
// up an AppState + PgPool. The actix handler is the only caller in prod.
fn verify_and_log(expected: Option<&str>, presented: &str, body: &[u8]) -> HttpResponse {
    let Some(expected) = expected else {
        // Fail closed if the operator forgot to wire the secret — accepting
        // anonymous webhooks would silently let any caller poison the indexer.
        tracing::error!("rejecting webhook: HELIUS_WEBHOOK_SECRET not configured");
        return HttpResponse::ServiceUnavailable().finish();
    };

    if !secret_matches(presented, expected) {
        tracing::warn!(
            presented_len = presented.len(),
            "rejecting webhook: bad Authorization header"
        );
        return HttpResponse::Unauthorized().finish();
    }

    tracing::info!(
        bytes = body.len(),
        "accepted Helius webhook payload (parser arrives in slice 3.3)"
    );
    HttpResponse::Accepted().finish()
}

// Length-prefixed constant-time compare. `ConstantTimeEq` on byte slices of
// different lengths returns false in constant time relative to the *shorter*
// length, so an attacker can still distinguish "right length, wrong bytes"
// from "wrong length". We accept that — the secret's length is not the
// sensitive bit; its content is.
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
        let resp = verify_and_log(None, "anything", b"{}");
        assert_eq!(resp.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[test]
    fn verify_401_on_missing_header() {
        let resp = verify_and_log(Some("hunter2"), "", b"{}");
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn verify_401_on_wrong_secret() {
        let resp = verify_and_log(Some("hunter2"), "nope", b"{}");
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn verify_202_on_good_secret() {
        let resp = verify_and_log(Some("hunter2"), "hunter2", b"{\"ok\":true}");
        assert_eq!(resp.status(), StatusCode::ACCEPTED);
    }
}
