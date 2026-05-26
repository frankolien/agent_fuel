-- `(signature, log_index)` is the natural idempotency key for the
-- at-least-once webhook stream; UPSERT on it absorbs Helius replays.
CREATE TABLE events (
    signature   TEXT      NOT NULL,
    log_index   INT       NOT NULL,
    slot        BIGINT    NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    program_id  TEXT      NOT NULL,
    event_name  TEXT      NOT NULL,
    payload     JSONB     NOT NULL,
    PRIMARY KEY (signature, log_index)
);

CREATE INDEX events_slot_desc_idx ON events (slot DESC);
CREATE INDEX events_program_idx ON events (program_id, slot DESC);
CREATE INDEX events_name_idx ON events (event_name, slot DESC);
-- jsonb_path_ops enables `WHERE payload @> '{"agent": "..."}'` without
-- denormalising payload fields into columns.
CREATE INDEX events_payload_gin_idx ON events USING GIN (payload jsonb_path_ops);
