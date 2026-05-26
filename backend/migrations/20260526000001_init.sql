-- Single-row deployment marker so a deployed instance can prove migrations
-- ran against this DB before any domain tables exist.
CREATE TABLE IF NOT EXISTS schema_meta (
    id           SMALLINT PRIMARY KEY DEFAULT 1,
    bootstrapped TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (id = 1)
);

INSERT INTO schema_meta (id) VALUES (1) ON CONFLICT DO NOTHING;
