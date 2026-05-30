-- Owner-scoped alerts surfaced in the mobile Alerts tab. Alert dispatch
-- (alerts.rs) writes a row here in the same call where it forwards to the
-- push-notification Notifier, and the WS hub re-broadcasts the alert as JSON
-- on the `alerts:<owner>` channel so the mobile UI can stream new ones in
-- without polling.
CREATE TABLE alerts (
    id          BIGSERIAL PRIMARY KEY,
    owner       TEXT NOT NULL,
    kind        TEXT NOT NULL,
    severity    TEXT NOT NULL,                   -- 'urgent' | 'info'
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    data        JSONB NOT NULL DEFAULT '{}'::jsonb,
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (severity IN ('urgent', 'info'))
);

CREATE INDEX alerts_owner_created_idx
    ON alerts (owner, created_at DESC);

-- Partial index narrows the "unread badge count" query to actual unread rows.
CREATE INDEX alerts_owner_unread_idx
    ON alerts (owner, created_at DESC)
    WHERE read_at IS NULL;
