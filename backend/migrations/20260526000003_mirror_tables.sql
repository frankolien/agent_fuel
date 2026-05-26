-- Mirror tables. The `events` table is the source of truth; these are
-- per-entity caches recomputed from it after each webhook batch, so a
-- replay reconverges instead of double-counting.

CREATE TABLE agents (
    pubkey                         TEXT PRIMARY KEY,
    owner                          TEXT NOT NULL,
    init_slot                      BIGINT NOT NULL,
    score                          INT  NOT NULL DEFAULT 0,
    total_transactions             BIGINT NOT NULL DEFAULT 0,
    total_volume_usdc              BIGINT NOT NULL DEFAULT 0,
    services_used                  INT  NOT NULL DEFAULT 0,
    consecutive_success            INT  NOT NULL DEFAULT 0,
    total_feedback_count           INT  NOT NULL DEFAULT 0,
    active_negative_feedback_count INT  NOT NULL DEFAULT 0,
    last_active_slot               BIGINT NOT NULL,
    updated_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX agents_owner_idx ON agents (owner);
CREATE INDEX agents_score_desc_idx ON agents (score DESC);

CREATE TABLE services (
    pubkey                       TEXT PRIMARY KEY,
    name                         TEXT NOT NULL,
    category                     SMALLINT NOT NULL,
    active                       BOOLEAN NOT NULL DEFAULT TRUE,
    init_slot                    BIGINT NOT NULL,
    total_agents_served          INT NOT NULL DEFAULT 0,
    total_volume_received_usdc   BIGINT NOT NULL DEFAULT 0,
    last_active_slot             BIGINT NOT NULL,
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX services_category_idx ON services (category);

CREATE TABLE vaults (
    pubkey               TEXT PRIMARY KEY,
    owner                TEXT NOT NULL,
    agent                TEXT NOT NULL,
    usdc_mint            TEXT NOT NULL,
    vault_token_account  TEXT NOT NULL,
    total_deposited      BIGINT NOT NULL DEFAULT 0,
    total_withdrawn      BIGINT NOT NULL DEFAULT 0,
    total_spent          BIGINT NOT NULL DEFAULT 0,
    total_claimed        BIGINT NOT NULL DEFAULT 0,
    frozen               BOOLEAN NOT NULL DEFAULT FALSE,
    per_tx_limit_usdc    BIGINT NOT NULL DEFAULT 0,
    hourly_limit_usdc    BIGINT NOT NULL DEFAULT 0,
    lifetime_limit_usdc  BIGINT NOT NULL DEFAULT 0,
    allow_post_pay       BOOLEAN NOT NULL DEFAULT FALSE,
    created_slot         BIGINT NOT NULL,
    last_active_slot     BIGINT NOT NULL,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vaults_owner_idx ON vaults (owner);
CREATE INDEX vaults_agent_idx ON vaults (agent);
