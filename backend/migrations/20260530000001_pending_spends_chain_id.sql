-- Webhook-driven verdict mirror: when an on-chain `Spent` (from
-- approve_spend) or `SpendRejected` (from cancel_spend) lands, we need to
-- flip the corresponding pending_spends row. SpendRejected gives us the
-- pending_spend pubkey directly; Spent doesn't, so we match by
-- (vault, service, amount, status='pending') FIFO. Storing the on-chain
-- pubkey + nonce here is what makes the SpendRejected path unambiguous.
ALTER TABLE pending_spends
    ADD COLUMN pending_spend_pubkey TEXT,
    ADD COLUMN nonce               BIGINT;

CREATE UNIQUE INDEX pending_spends_pubkey_uniq
    ON pending_spends (pending_spend_pubkey)
    WHERE pending_spend_pubkey IS NOT NULL;
