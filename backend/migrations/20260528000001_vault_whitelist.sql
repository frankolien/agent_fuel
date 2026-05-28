-- Mirror the current spend-policy whitelist on the vault row. Source of truth
-- is the latest PolicyUpdated event for each vault; this column is a cache
-- recomputed by `mirror::refresh_vault`. Stored as TEXT[] of base58 pubkeys
-- with the zero-pubkey (Pubkey::default) filtered out.
ALTER TABLE vaults
    ADD COLUMN whitelist TEXT[] NOT NULL DEFAULT '{}';
