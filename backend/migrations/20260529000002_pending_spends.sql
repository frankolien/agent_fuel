-- Pending spend approvals. Created when an agent attempts a spend that
-- exceeds its policy's per-tx limit. The owner reviews from the mobile
-- Alerts tab, biometric-confirms, and POSTs /api/spends/:id/approve to
-- release it. Approved/rejected rows stay for audit; cleanup is by TTL job
-- (out of scope here — rows are small).
CREATE TABLE pending_spends (
    id              BIGSERIAL PRIMARY KEY,
    owner           TEXT NOT NULL,
    agent           TEXT NOT NULL,
    vault           TEXT NOT NULL,
    service         TEXT NOT NULL,
    amount_usdc     BIGINT NOT NULL,                -- micro-USDC (1e-6)
    reason          TEXT NOT NULL,                  -- 'per_tx_exceeded' | 'hourly_exceeded' | 'lifetime_exceeded'
    status          TEXT NOT NULL DEFAULT 'pending',-- 'pending' | 'approved' | 'rejected' | 'expired'
    alert_id        BIGINT,                         -- the alerts row that surfaced this; nullable for replay safety
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at      TIMESTAMPTZ,
    CHECK (amount_usdc > 0),
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    CHECK (reason IN ('per_tx_exceeded', 'hourly_exceeded', 'lifetime_exceeded'))
);

CREATE INDEX pending_spends_owner_status_idx
    ON pending_spends (owner, status, created_at DESC);

CREATE INDEX pending_spends_alert_idx
    ON pending_spends (alert_id) WHERE alert_id IS NOT NULL;
