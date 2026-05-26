-- Phase 3 Slice 1: bootstrap migration.
--
-- `schema_meta` records a single row per deployment fingerprint so the
-- readiness endpoint can confirm the migration system reached this DB on the
-- expected revision. Real domain tables (events, agents, vaults, services,
-- score_history) arrive in Slices 3.3-3.5.

CREATE TABLE IF NOT EXISTS schema_meta (
    id           SMALLINT PRIMARY KEY DEFAULT 1,
    bootstrapped TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (id = 1)
);

INSERT INTO schema_meta (id) VALUES (1) ON CONFLICT DO NOTHING;
