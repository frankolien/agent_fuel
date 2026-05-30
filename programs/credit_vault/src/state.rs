use anchor_lang::prelude::*;

#[account]
pub struct CreditVault {
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub usdc_mint: Pubkey,
    pub vault_token_account: Pubkey,
    pub total_deposited: u64,
    pub total_withdrawn: u64,
    pub total_spent: u64,
    pub total_claimed: u64,
    pub frozen: bool,
    pub created_slot: u64,
    pub last_active_slot: u64,
    pub bump: u8,
    /// Monotonic counter used as a PDA seed for PendingSpend accounts so
    /// every approval request gets a unique deterministic address.
    /// Borrowed 8 bytes from the original 64-byte padding so the account
    /// size stays at `ACCOUNT_SIZE` and existing vaults need no migration.
    pub pending_count: u64,
    pub _padding: [u8; 56],
}

impl CreditVault {
    // disc(8) + 4×Pubkey(128) + 4×u64(32) + bool(1) + 2×u64(16) + bump(1)
    // + pending_count(8) + padding(56) = 250
    pub const ACCOUNT_SIZE: usize =
        8 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 1 + 8 + 8 + 1 + 8 + 56;
}

// Slice 2.5: fixed-size whitelist on the policy rather than a merkle root.
// 8 slots covers realistic v1 vault usage (one agent + a handful of services).
// All-zero array = "allow any service". See data-model.md for rationale.
pub const WHITELIST_LEN: usize = 8;

// Slice 2.7: rolling hourly window length, ≈ 1 hour at 400 ms slot time.
pub const SLOTS_PER_HOUR: u64 = 9_000;

#[account]
pub struct SpendPolicy {
    pub vault: Pubkey,
    pub whitelist: [Pubkey; WHITELIST_LEN],
    pub per_tx_limit_usdc: u64,
    pub hourly_limit_usdc: u64,
    pub lifetime_limit_usdc: u64,
    pub hourly_window_start_slot: u64,
    pub hourly_window_spent_usdc: u64,
    pub allow_post_pay: bool,
    pub bump: u8,
    pub _padding: [u8; 64],
}

impl SpendPolicy {
    // disc(8) + vault(32) + whitelist(8×32=256) + 5×u64(40) + bool(1) + bump(1) + padding(64) = 402
    pub const ACCOUNT_SIZE: usize = 8 + 32 + (32 * WHITELIST_LEN) + 8 + 8 + 8 + 8 + 8 + 1 + 1 + 64;
}

/// A spend request that exceeded one of the policy's rate limits. The agent
/// creates this account by calling `request_spend`; the owner reviews from
/// the mobile Alerts tab and either calls `approve_spend` (PDA-signed CPI
/// transfer, account closed) or `cancel_spend` (account closed, no transfer).
///
/// Seeded by `["pending", vault, nonce_le]` where `nonce` is the value of
/// `vault.pending_count` at request time, so each request has a unique
/// deterministic address that both the agent and the owner can derive.
#[account]
pub struct PendingSpend {
    pub vault: Pubkey,
    pub agent: Pubkey,
    /// Owner of the destination token account (mirrors how `Spent` records
    /// service: `service_token_account.owner`).
    pub service: Pubkey,
    pub amount_usdc: u64,
    pub requested_slot: u64,
    pub nonce: u64,
    pub bump: u8,
    pub _padding: [u8; 31],
}

impl PendingSpend {
    // disc(8) + 3×Pubkey(96) + 3×u64(24) + bump(1) + padding(31) = 160
    pub const ACCOUNT_SIZE: usize = 8 + 32 + 32 + 32 + 8 + 8 + 8 + 1 + 31;
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};

    #[test]
    fn credit_vault_account_size_matches_data_model() {
        // disc(8) + owner(32) + agent(32) + usdc_mint(32) + vault_token_account(32)
        // + total_deposited(8) + total_withdrawn(8) + total_spent(8) + total_claimed(8)
        // + frozen(1) + created_slot(8) + last_active_slot(8) + bump(1) + padding(64)
        let expected = 8 + 32 * 4 + 8 * 4 + 1 + 8 * 2 + 1 + 64;
        assert_eq!(CreditVault::ACCOUNT_SIZE, expected);
    }

    #[test]
    fn credit_vault_discriminator_matches_anchor_format() {
        let mut hasher = Sha256::new();
        hasher.update(b"account:CreditVault");
        let expected: [u8; 8] = hasher.finalize()[..8].try_into().unwrap();
        assert_eq!(CreditVault::DISCRIMINATOR, expected);
    }

    #[test]
    fn spend_policy_account_size_matches_data_model() {
        // disc(8) + vault(32) + whitelist(8*Pubkey=256) + 5*u64(40) + bool(1) + bump(1) + padding(64)
        let expected = 8 + 32 + 32 * WHITELIST_LEN + 8 * 5 + 1 + 1 + 64;
        assert_eq!(SpendPolicy::ACCOUNT_SIZE, expected);
        assert_eq!(SpendPolicy::ACCOUNT_SIZE, 402);
    }

    #[test]
    fn spend_policy_discriminator_matches_anchor_format() {
        let mut hasher = Sha256::new();
        hasher.update(b"account:SpendPolicy");
        let expected: [u8; 8] = hasher.finalize()[..8].try_into().unwrap();
        assert_eq!(SpendPolicy::DISCRIMINATOR, expected);
    }

    #[test]
    fn pending_spend_account_size_matches_data_model() {
        // disc(8) + vault(32) + agent(32) + service(32) + amount(8) + slot(8)
        // + nonce(8) + bump(1) + padding(31) = 160
        let expected = 8 + 32 + 32 + 32 + 8 + 8 + 8 + 1 + 31;
        assert_eq!(PendingSpend::ACCOUNT_SIZE, expected);
        assert_eq!(PendingSpend::ACCOUNT_SIZE, 160);
    }

    #[test]
    fn pending_spend_discriminator_matches_anchor_format() {
        let mut hasher = Sha256::new();
        hasher.update(b"account:PendingSpend");
        let expected: [u8; 8] = hasher.finalize()[..8].try_into().unwrap();
        assert_eq!(PendingSpend::DISCRIMINATOR, expected);
    }
}
