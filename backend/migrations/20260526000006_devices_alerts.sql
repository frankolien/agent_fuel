-- FCM device tokens registered by owners. `(owner, fcm_token)` is the
-- natural dedup key — same wallet on the same device re-registers without
-- creating duplicates.
CREATE TABLE device_tokens (
    id              BIGSERIAL PRIMARY KEY,
    owner           TEXT NOT NULL,
    fcm_token       TEXT NOT NULL,
    platform        TEXT NOT NULL,
    registered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (owner, fcm_token)
);
CREATE INDEX device_tokens_owner_idx ON device_tokens (owner);

-- Tracks the highest budget threshold (70/80/90) we've already alerted on
-- per vault so re-crossings don't spam the owner. 0 means "no alerts sent".
ALTER TABLE vaults ADD COLUMN last_budget_alert_pct SMALLINT NOT NULL DEFAULT 0;
