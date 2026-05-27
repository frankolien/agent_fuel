use actix_web::{http::header, post, web, FromRequest, HttpRequest, HttpResponse, Responder};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::{auth, state::AppState};

#[derive(Deserialize)]
pub struct NonceRequest {
    pub pubkey: String,
}

#[derive(Serialize)]
pub struct NonceResponse {
    pub nonce: String,
    pub message: String,
    pub issued_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

#[post("/auth/nonce")]
pub async fn nonce(state: web::Data<AppState>, body: web::Json<NonceRequest>) -> impl Responder {
    let cfg = auth::AuthConfig {
        jwt_secret: state.jwt_secret.clone(),
        domain: state.siws_domain.clone(),
        chain_id: state.siws_chain_id.clone(),
    };
    match auth::issue_nonce(&state.pool, &cfg, &body.pubkey).await {
        Ok(new) => HttpResponse::Ok().json(NonceResponse {
            nonce: new.nonce,
            message: new.message,
            issued_at: new.issued_at,
            expires_at: new.expires_at,
        }),
        Err(auth::AuthError::InvalidPubkey | auth::AuthError::PubkeyWrongSize) => {
            HttpResponse::BadRequest().body("invalid pubkey")
        }
        Err(err) => {
            tracing::error!(error = %err, "nonce issue failed");
            HttpResponse::InternalServerError().finish()
        }
    }
}

#[derive(Deserialize)]
pub struct VerifyRequest {
    pub pubkey: String,
    pub nonce: String,
    pub signature: String,
}

#[derive(Serialize)]
pub struct VerifyResponse {
    pub token: String,
    pub expires_at: DateTime<Utc>,
}

#[post("/auth/verify")]
pub async fn verify(state: web::Data<AppState>, body: web::Json<VerifyRequest>) -> impl Responder {
    let cfg = auth::AuthConfig {
        jwt_secret: state.jwt_secret.clone(),
        domain: state.siws_domain.clone(),
        chain_id: state.siws_chain_id.clone(),
    };
    match auth::verify_and_mint(&state.pool, &cfg, &body.pubkey, &body.nonce, &body.signature).await {
        Ok(t) => HttpResponse::Ok().json(VerifyResponse {
            token: t.token,
            expires_at: t.expires_at,
        }),
        Err(auth::AuthError::NotConfigured) => {
            tracing::error!("/auth/verify called but JWT_SECRET is unset");
            HttpResponse::ServiceUnavailable().finish()
        }
        Err(auth::AuthError::NonceInvalid) => HttpResponse::Unauthorized().body("nonce invalid"),
        Err(auth::AuthError::SignatureVerification) => {
            HttpResponse::Unauthorized().body("signature verification failed")
        }
        Err(
            auth::AuthError::InvalidPubkey
            | auth::AuthError::PubkeyWrongSize
            | auth::AuthError::InvalidSignature
            | auth::AuthError::SignatureWrongSize,
        ) => HttpResponse::BadRequest().body("invalid pubkey or signature encoding"),
        Err(err) => {
            tracing::error!(error = %err, "verify failed");
            HttpResponse::InternalServerError().finish()
        }
    }
}

/// Extractor for handlers that require a valid SIWS-issued JWT.
/// Usage: `async fn handler(caller: AuthedPubkey, ...) -> impl Responder`.
pub struct AuthedPubkey(pub String);

impl FromRequest for AuthedPubkey {
    type Error = actix_web::Error;
    type Future = std::future::Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _: &mut actix_web::dev::Payload) -> Self::Future {
        std::future::ready(extract(req))
    }
}

fn extract(req: &HttpRequest) -> Result<AuthedPubkey, actix_web::Error> {
    let state = req
        .app_data::<web::Data<AppState>>()
        .ok_or_else(|| actix_web::error::ErrorInternalServerError("missing AppState"))?;
    let secret = state
        .jwt_secret
        .as_deref()
        .ok_or_else(|| actix_web::error::ErrorServiceUnavailable("auth not configured"))?;
    let header_value = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("missing Authorization header"))?;
    let token = header_value
        .strip_prefix("Bearer ")
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("expected 'Bearer <jwt>'"))?;
    let claims = auth::verify_jwt(secret, token)
        .map_err(|_| actix_web::error::ErrorUnauthorized("invalid or expired token"))?;
    Ok(AuthedPubkey(claims.sub))
}
