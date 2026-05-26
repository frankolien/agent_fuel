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
    pub _padding: [u8; 64],
}

impl CreditVault {
    // disc(8) + 4×Pubkey(128) + 4×u64(32) + bool(1) + 2×u64(16) + bump(1) + padding(64) = 250
    pub const ACCOUNT_SIZE: usize = 8 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 1 + 8 + 8 + 1 + 64;
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
}
