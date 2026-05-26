-- Single-use SIWS nonces. The (nonce, pubkey) pair is consumed exactly once
-- on /auth/verify; `consumed_at` makes replay attempts visible at the row
-- level instead of being silently dedup'd.
CREATE TABLE auth_nonces (
    nonce        TEXT PRIMARY KEY,
    pubkey       TEXT NOT NULL,
    issued_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL,
    consumed_at  TIMESTAMPTZ
);
CREATE INDEX auth_nonces_pubkey_idx ON auth_nonces (pubkey, expires_at DESC);
CREATE INDEX auth_nonces_expires_idx ON auth_nonces (expires_at)
    WHERE consumed_at IS NULL;
