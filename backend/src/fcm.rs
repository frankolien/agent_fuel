// FCM HTTP v1 dispatcher: exchanges a service-account JWT for an OAuth2
// access token (cached until ~5 min before expiry), fans the alert out to
// every device_tokens row for the owner, and deletes any token FCM tells
// us is dead (404 / UNREGISTERED / INVALID_ARGUMENT). Dispatch is
// fire-and-forget on a tokio task so the webhook hot path doesn't pay the
// FCM round-trip latency.

use std::fs;
use std::path::Path;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use jsonwebtoken::{Algorithm, EncodingKey, Header};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use tokio::sync::RwLock;

use crate::notifier::{Alert, Notifier};

const FCM_SCOPE: &str = "https://www.googleapis.com/auth/firebase.messaging";
// Refresh the cached access token this many seconds before its stated
// expiry — covers clock skew + a generous in-flight request budget.
const TOKEN_REFRESH_LEAD_SECS: u64 = 300;

#[derive(Debug, Clone, Deserialize)]
struct ServiceAccount {
    project_id: String,
    private_key: String,
    client_email: String,
    token_uri: String,
}

#[derive(Serialize)]
struct JwtClaims<'a> {
    iss: &'a str,
    scope: &'a str,
    aud: &'a str,
    iat: u64,
    exp: u64,
}

#[derive(Deserialize)]
struct OAuthTokenResponse {
    access_token: String,
    expires_in: u64,
}

#[derive(Debug, Clone)]
struct CachedToken {
    access_token: String,
    expires_at_unix: u64,
}

pub struct FcmNotifier {
    inner: Arc<Inner>,
}

struct Inner {
    sa: ServiceAccount,
    encoding_key: EncodingKey,
    http: Client,
    token: RwLock<Option<CachedToken>>,
    pool: PgPool,
    send_url: String,
}

impl FcmNotifier {
    pub fn build(
        pool: PgPool,
        path: Option<&str>,
        b64: Option<&str>,
    ) -> Result<Option<Self>> {
        let sa = match (b64, path) {
            (Some(b64), _) => parse_service_account_b64(b64)?,
            (None, Some(path)) => parse_service_account_path(path)?,
            (None, None) => return Ok(None),
        };
        let encoding_key = EncodingKey::from_rsa_pem(sa.private_key.as_bytes())
            .context("FCM service-account private_key is not a valid RSA PEM")?;
        let http = Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .context("building FCM reqwest client")?;
        let send_url = format!(
            "https://fcm.googleapis.com/v1/projects/{}/messages:send",
            sa.project_id
        );
        Ok(Some(Self {
            inner: Arc::new(Inner {
                sa,
                encoding_key,
                http,
                token: RwLock::new(None),
                pool,
                send_url,
            }),
        }))
    }

    pub fn project_id(&self) -> &str {
        &self.inner.sa.project_id
    }

    pub fn client_email(&self) -> &str {
        &self.inner.sa.client_email
    }
}

#[async_trait]
impl Notifier for FcmNotifier {
    async fn dispatch(&self, alert: &Alert) {
        // Owned copy so the spawned task is independent of the caller's
        // borrow lifetime. The webhook handler returns 202 immediately
        // while the actual FCM round-trips happen in the background.
        let inner = Arc::clone(&self.inner);
        let alert = alert.clone();
        tokio::spawn(async move {
            if let Err(err) = send_alert(inner, &alert).await {
                tracing::warn!(
                    error = %err,
                    owner = %alert.owner,
                    kind = ?alert.kind,
                    "FCM dispatch failed"
                );
            }
        });
    }
}

async fn send_alert(inner: Arc<Inner>, alert: &Alert) -> Result<()> {
    let rows: Vec<(i64, String, String)> = sqlx::query_as(
        "SELECT id, fcm_token, platform FROM device_tokens WHERE owner = $1",
    )
    .bind(&alert.owner)
    .fetch_all(&inner.pool)
    .await
    .context("looking up device_tokens")?;

    if rows.is_empty() {
        tracing::debug!(owner = %alert.owner, "no device tokens registered; skipping FCM");
        return Ok(());
    }

    let access_token = ensure_access_token(&inner).await?;
    for (id, token, platform) in rows {
        let body = build_message_body(&token, &platform, alert);
        let resp = inner
            .http
            .post(&inner.send_url)
            .bearer_auth(&access_token)
            .json(&body)
            .send()
            .await;
        match resp {
            Ok(r) if r.status().is_success() => {
                tracing::info!(owner = %alert.owner, device = id, "FCM delivered");
            }
            Ok(r) => {
                let status = r.status();
                let text = r.text().await.unwrap_or_default();
                if is_stale_token_error(status.as_u16(), &text) {
                    if let Err(err) = sqlx::query("DELETE FROM device_tokens WHERE id = $1")
                        .bind(id)
                        .execute(&inner.pool)
                        .await
                    {
                        tracing::warn!(error = %err, device = id, "failed to delete stale token");
                    } else {
                        tracing::info!(device = id, owner = %alert.owner, "deleted stale FCM token");
                    }
                } else {
                    tracing::warn!(
                        device = id,
                        owner = %alert.owner,
                        status = %status,
                        body = %text,
                        "FCM rejected message"
                    );
                }
            }
            Err(err) => {
                tracing::warn!(
                    device = id,
                    owner = %alert.owner,
                    error = %err,
                    "FCM send transport error"
                );
            }
        }
    }
    Ok(())
}

fn build_message_body(token: &str, platform: &str, alert: &Alert) -> serde_json::Value {
    // Notification payload renders the system tray banner; data payload
    // gives the mobile app the structured fields it needs to route a tap
    // to the right alert / approval sheet without re-fetching.
    let mut data = serde_json::Map::new();
    data.insert("kind".to_string(), serde_json::Value::String(alert.kind.as_str().to_string()));
    data.insert("severity".to_string(), serde_json::Value::String(alert.severity.as_str().to_string()));
    data.insert("payload".to_string(), serde_json::Value::String(alert.data.to_string()));

    let mut message = serde_json::json!({
        "token": token,
        "notification": {
            "title": alert.title,
            "body": alert.body,
        },
        "data": data,
    });
    // Urgent priority + a dedicated channel id so the mobile app can apply
    // a higher-importance NotificationChannel (sound + heads-up) for
    // approval prompts. Non-Android platforms ignore this block.
    if platform.eq_ignore_ascii_case("android") {
        message["android"] = serde_json::json!({
            "priority": "HIGH",
            "notification": {
                "channel_id": "approvals",
            },
        });
    }
    serde_json::json!({ "message": message })
}

fn is_stale_token_error(status: u16, body: &str) -> bool {
    if status == 404 {
        return true;
    }
    // FCM 400/403 with one of these error codes means the token is dead and
    // should be removed. Other 400/403s (bad payload, quota) are transient
    // and shouldn't drop the registration.
    body.contains("UNREGISTERED")
        || body.contains("INVALID_ARGUMENT")
        || body.contains("registration-token-not-registered")
}

async fn ensure_access_token(inner: &Arc<Inner>) -> Result<String> {
    let now = unix_now();
    {
        let guard = inner.token.read().await;
        if let Some(t) = guard.as_ref() {
            if t.expires_at_unix > now + TOKEN_REFRESH_LEAD_SECS {
                return Ok(t.access_token.clone());
            }
        }
    }
    let fresh = mint_access_token(inner).await?;
    let mut guard = inner.token.write().await;
    *guard = Some(fresh.clone());
    Ok(fresh.access_token)
}

async fn mint_access_token(inner: &Arc<Inner>) -> Result<CachedToken> {
    let now = unix_now();
    let claims = JwtClaims {
        iss: &inner.sa.client_email,
        scope: FCM_SCOPE,
        aud: &inner.sa.token_uri,
        iat: now,
        exp: now + 3600,
    };
    let header = Header::new(Algorithm::RS256);
    let jwt = jsonwebtoken::encode(&header, &claims, &inner.encoding_key)
        .context("signing FCM service-account JWT")?;

    let params = [
        ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
        ("assertion", &jwt),
    ];
    let resp = inner
        .http
        .post(&inner.sa.token_uri)
        .form(&params)
        .send()
        .await
        .context("exchanging FCM service-account JWT")?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(anyhow!("FCM token exchange failed: {status} {text}"));
    }
    let parsed: OAuthTokenResponse = resp
        .json()
        .await
        .context("parsing FCM token-exchange response")?;
    Ok(CachedToken {
        access_token: parsed.access_token,
        expires_at_unix: now + parsed.expires_in,
    })
}

fn parse_service_account_path(path: &str) -> Result<ServiceAccount> {
    let expanded = expand_tilde(path);
    let bytes = fs::read(&expanded)
        .with_context(|| format!("reading FCM service-account file at {expanded}"))?;
    serde_json::from_slice(&bytes)
        .with_context(|| format!("FCM service-account file at {expanded} is not valid JSON"))
}

fn parse_service_account_b64(b64: &str) -> Result<ServiceAccount> {
    let bytes = BASE64_STANDARD
        .decode(b64.trim())
        .context("decoding FCM_SERVICE_ACCOUNT_B64 base64")?;
    serde_json::from_slice(&bytes)
        .context("FCM_SERVICE_ACCOUNT_B64 decodes to invalid JSON")
}

fn expand_tilde(path: &str) -> String {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = std::env::var_os("HOME") {
            return format!("{}/{rest}", Path::new(&home).display());
        }
    }
    path.to_string()
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
