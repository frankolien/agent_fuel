use chrono::{DateTime, Duration, Utc};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

const NONCE_TTL_SECONDS: i64 = 300;
const JWT_TTL_SECONDS: i64 = 3600;

#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("invalid base58 pubkey")]
    InvalidPubkey,
    #[error("pubkey is not 32 bytes")]
    PubkeyWrongSize,
    #[error("invalid base58 signature")]
    InvalidSignature,
    #[error("signature is not 64 bytes")]
    SignatureWrongSize,
    #[error("signature verification failed")]
    SignatureVerification,
    #[error("nonce not found, already consumed, or expired")]
    NonceInvalid,
    #[error("auth not configured (JWT_SECRET unset)")]
    NotConfigured,
    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),
    #[error("jwt error: {0}")]
    Jwt(#[from] jsonwebtoken::errors::Error),
}

#[derive(Clone)]
pub struct AuthConfig {
    pub jwt_secret: Option<String>,
    pub domain: String,
    pub chain_id: String,
}

/// Domain-bound, time-bound message the wallet signs. Plain text so the
/// user can read it in their wallet popup; the parser on /auth/verify
/// doesn't need it — we hand back the nonce, look it up by primary key,
/// and re-derive the message server-side for signature verification.
pub fn build_message(
    domain: &str,
    chain_id: &str,
    pubkey: &str,
    nonce: &str,
    issued_at: DateTime<Utc>,
    expires_at: DateTime<Utc>,
) -> String {
    format!(
        "{domain} wants you to sign in with your Solana account:\n\
        {pubkey}\n\
        \n\
        Sign in to manage your Agent Fuel agents and vaults.\n\
        \n\
        URI: https://{domain}\n\
        Version: 1\n\
        Chain ID: {chain_id}\n\
        Nonce: {nonce}\n\
        Issued At: {issued}\n\
        Expiration Time: {expires}",
        issued = issued_at.to_rfc3339(),
        expires = expires_at.to_rfc3339(),
    )
}

pub struct NewNonce {
    pub nonce: String,
    pub message: String,
    pub issued_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

pub async fn issue_nonce(
    pool: &PgPool,
    cfg: &AuthConfig,
    pubkey: &str,
) -> Result<NewNonce, AuthError> {
    validate_pubkey(pubkey)?;
    let nonce = random_nonce();
    let issued_at = Utc::now();
    let expires_at = issued_at + Duration::seconds(NONCE_TTL_SECONDS);

    sqlx::query(
        "INSERT INTO auth_nonces (nonce, pubkey, issued_at, expires_at) VALUES ($1, $2, $3, $4)",
    )
    .bind(&nonce)
    .bind(pubkey)
    .bind(issued_at)
    .bind(expires_at)
    .execute(pool)
    .await?;

    let message = build_message(
        &cfg.domain,
        &cfg.chain_id,
        pubkey,
        &nonce,
        issued_at,
        expires_at,
    );
    Ok(NewNonce {
        nonce,
        message,
        issued_at,
        expires_at,
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: i64,
    pub iat: i64,
}

pub struct VerifiedToken {
    pub token: String,
    pub expires_at: DateTime<Utc>,
}

pub async fn verify_and_mint(
    pool: &PgPool,
    cfg: &AuthConfig,
    pubkey: &str,
    signature_b58: &str,
) -> Result<VerifiedToken, AuthError> {
    let Some(secret) = cfg.jwt_secret.as_deref() else {
        return Err(AuthError::NotConfigured);
    };
    let pubkey_bytes = decode_pubkey(pubkey)?;
    let signature_bytes = decode_signature(signature_b58)?;

    // Atomic claim: only succeeds if the nonce is unconsumed and unexpired.
    // `RETURNING` gives us the issued_at + expires_at so we can rebuild the
    // signed message without keeping it server-side between requests.
    let row: Option<(String, DateTime<Utc>, DateTime<Utc>)> = sqlx::query_as(
        r#"
        UPDATE auth_nonces
           SET consumed_at = now()
         WHERE pubkey = $1
           AND consumed_at IS NULL
           AND expires_at > now()
         RETURNING nonce, issued_at, expires_at
        "#,
    )
    .bind(pubkey)
    .fetch_optional(pool)
    .await?;
    let Some((nonce, issued_at, expires_at)) = row else {
        return Err(AuthError::NonceInvalid);
    };

    let message = build_message(
        &cfg.domain,
        &cfg.chain_id,
        pubkey,
        &nonce,
        issued_at,
        expires_at,
    );
    let verifying_key =
        VerifyingKey::from_bytes(&pubkey_bytes).map_err(|_| AuthError::SignatureVerification)?;
    let signature = Signature::from_bytes(&signature_bytes);
    verifying_key
        .verify(message.as_bytes(), &signature)
        .map_err(|_| AuthError::SignatureVerification)?;

    let now = Utc::now();
    let exp = now + Duration::seconds(JWT_TTL_SECONDS);
    let claims = Claims {
        sub: pubkey.to_string(),
        exp: exp.timestamp(),
        iat: now.timestamp(),
    };
    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )?;
    Ok(VerifiedToken {
        token,
        expires_at: exp,
    })
}

pub fn verify_jwt(secret: &str, token: &str) -> Result<Claims, AuthError> {
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )?;
    Ok(data.claims)
}

fn random_nonce() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

fn validate_pubkey(pubkey: &str) -> Result<(), AuthError> {
    decode_pubkey(pubkey).map(|_| ())
}

fn decode_pubkey(pubkey: &str) -> Result<[u8; 32], AuthError> {
    let bytes = bs58::decode(pubkey)
        .into_vec()
        .map_err(|_| AuthError::InvalidPubkey)?;
    bytes.try_into().map_err(|_| AuthError::PubkeyWrongSize)
}

fn decode_signature(sig_b58: &str) -> Result<[u8; 64], AuthError> {
    let bytes = bs58::decode(sig_b58)
        .into_vec()
        .map_err(|_| AuthError::InvalidSignature)?;
    bytes.try_into().map_err(|_| AuthError::SignatureWrongSize)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    #[test]
    fn message_contains_required_siws_fields() {
        let issued = DateTime::parse_from_rfc3339("2026-05-26T12:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let expires = issued + Duration::seconds(300);
        let msg = build_message(
            "agent-fuel.dev",
            "solana:devnet",
            "AxMZj6QHB4Zxe7wpUCidh1cS7ueN2MGsiWLKCMokTA64",
            "deadbeef",
            issued,
            expires,
        );
        assert!(msg.contains("agent-fuel.dev wants you to sign in"));
        assert!(msg.contains("AxMZj6QHB4Zxe7wpUCidh1cS7ueN2MGsiWLKCMokTA64"));
        assert!(msg.contains("Chain ID: solana:devnet"));
        assert!(msg.contains("Nonce: deadbeef"));
        assert!(msg.contains("Expiration Time: 2026-05-26T12:05:00"));
    }

    #[test]
    fn random_nonce_is_32_hex_chars() {
        let n = random_nonce();
        assert_eq!(n.len(), 32);
        assert!(n.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn random_nonce_is_not_predictable() {
        let n1 = random_nonce();
        let n2 = random_nonce();
        assert_ne!(n1, n2);
    }

    #[test]
    fn pubkey_round_trips_through_decode() {
        let pubkey_str = "AxMZj6QHB4Zxe7wpUCidh1cS7ueN2MGsiWLKCMokTA64";
        let bytes = decode_pubkey(pubkey_str).unwrap();
        let re = bs58::encode(bytes).into_string();
        assert_eq!(re, pubkey_str);
    }

    #[test]
    fn pubkey_rejects_garbage() {
        assert!(matches!(
            decode_pubkey("not_base58!@#"),
            Err(AuthError::InvalidPubkey)
        ));
    }

    #[test]
    fn pubkey_rejects_wrong_length() {
        let short = bs58::encode([0u8; 16]).into_string();
        assert!(matches!(
            decode_pubkey(&short),
            Err(AuthError::PubkeyWrongSize)
        ));
    }

    #[test]
    fn signature_rejects_wrong_length() {
        let short = bs58::encode([0u8; 32]).into_string();
        assert!(matches!(
            decode_signature(&short),
            Err(AuthError::SignatureWrongSize)
        ));
    }

    #[test]
    fn jwt_round_trip_recovers_pubkey() {
        let secret = "test-secret";
        let claims = Claims {
            sub: "PUBKEY".into(),
            exp: (Utc::now() + Duration::hours(1)).timestamp(),
            iat: Utc::now().timestamp(),
        };
        let token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .unwrap();
        let decoded = verify_jwt(secret, &token).unwrap();
        assert_eq!(decoded.sub, "PUBKEY");
    }

    #[test]
    fn jwt_rejects_wrong_secret() {
        let claims = Claims {
            sub: "PUBKEY".into(),
            exp: (Utc::now() + Duration::hours(1)).timestamp(),
            iat: Utc::now().timestamp(),
        };
        let token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(b"good"),
        )
        .unwrap();
        assert!(verify_jwt("evil", &token).is_err());
    }

    #[test]
    fn jwt_rejects_expired() {
        let claims = Claims {
            sub: "PUBKEY".into(),
            exp: (Utc::now() - Duration::hours(1)).timestamp(),
            iat: (Utc::now() - Duration::hours(2)).timestamp(),
        };
        let token = encode(&Header::default(), &claims, &EncodingKey::from_secret(b"k")).unwrap();
        assert!(verify_jwt("k", &token).is_err());
    }

    // Proves a wallet-style signature over our SIWS message verifies cleanly
    // through the same ed25519-dalek path /auth/verify uses.
    #[test]
    fn signs_and_verifies_siws_message_end_to_end() {
        let signing_key = SigningKey::from_bytes(&[7u8; 32]);
        let pubkey_bytes = signing_key.verifying_key().to_bytes();
        let pubkey_b58 = bs58::encode(pubkey_bytes).into_string();

        let issued = Utc::now();
        let expires = issued + Duration::seconds(300);
        let message = build_message(
            "agent-fuel.dev",
            "solana:devnet",
            &pubkey_b58,
            "deadbeef",
            issued,
            expires,
        );
        let sig: Signature = signing_key.sign(message.as_bytes());
        let verifying_key = VerifyingKey::from_bytes(&pubkey_bytes).unwrap();
        verifying_key.verify(message.as_bytes(), &sig).unwrap();
    }
}
