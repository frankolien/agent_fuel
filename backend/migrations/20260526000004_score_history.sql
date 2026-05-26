-- Append-only score snapshots, one row per on-chain ScoreComputed.
-- `(agent, slot)` is unique because the program emits at most one per slot.
CREATE TABLE score_history (
    id          BIGSERIAL PRIMARY KEY,
    agent       TEXT NOT NULL,
    score       INT  NOT NULL,
    slot        BIGINT NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (agent, slot)
);
CREATE INDEX score_history_agent_slot_desc_idx ON score_history (agent, slot DESC);
