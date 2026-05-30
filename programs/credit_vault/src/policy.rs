// Shared six-check spend-policy enforcement used by `spend` and `claim`. One
// home for the ladder so the two instructions can't drift on the auth surface.
// Caller still does the SPL transfer, the per-caller counter bumps,
// last_active_slot, and event emission.

use anchor_lang::prelude::*;

use crate::errors::VaultError;
use crate::state::{CreditVault, SpendPolicy, SLOTS_PER_HOUR};

pub fn check_and_record_spend(
    vault: &mut CreditVault,
    policy: &mut SpendPolicy,
    recipient_service: &Pubkey,
    amount_usdc: u64,
    current_slot: u64,
) -> Result<()> {
    require!(!vault.frozen, VaultError::Frozen);
    require!(amount_usdc > 0, VaultError::ZeroAmount);

    check_whitelist(&policy.whitelist, recipient_service)?;

    if policy.per_tx_limit_usdc > 0 {
        require!(
            amount_usdc <= policy.per_tx_limit_usdc,
            VaultError::PerTxLimitExceeded
        );
    }

    if policy.hourly_limit_usdc > 0 {
        // Fresh state (start_slot=0, spent=0) is handled naturally on real
        // clusters: the first spend's `elapsed` exceeds SLOTS_PER_HOUR by
        // millions and resets the window. In tests at slot 0 the elapsed
        // is 0 < SLOTS_PER_HOUR so we DON'T reset, and the spent counter
        // is already 0 so the math works. NO start_slot==0 sentinel here:
        // the slot value alone cannot distinguish "never spent" from
        // "spent at slot 0".
        let window_elapsed =
            current_slot.saturating_sub(policy.hourly_window_start_slot) >= SLOTS_PER_HOUR;
        if window_elapsed {
            policy.hourly_window_start_slot = current_slot;
            policy.hourly_window_spent_usdc = 0;
        }
        let new_window_total = policy
            .hourly_window_spent_usdc
            .checked_add(amount_usdc)
            .ok_or(VaultError::Overflow)?;
        require!(
            new_window_total <= policy.hourly_limit_usdc,
            VaultError::HourlyLimitExceeded
        );
        policy.hourly_window_spent_usdc = new_window_total;
    }

    let new_total_spent = vault
        .total_spent
        .checked_add(amount_usdc)
        .ok_or(VaultError::Overflow)?;
    if policy.lifetime_limit_usdc > 0 {
        require!(
            new_total_spent <= policy.lifetime_limit_usdc,
            VaultError::LifetimeLimitExceeded
        );
    }
    vault.total_spent = new_total_spent;

    Ok(())
}

// All-zero whitelist == no enforcement. Otherwise recipient must match.
pub fn check_whitelist(whitelist: &[Pubkey], recipient: &Pubkey) -> Result<()> {
    let default = Pubkey::default();
    let any_set = whitelist.iter().any(|p| p != &default);
    if !any_set {
        return Ok(());
    }
    let allowed = whitelist.iter().any(|p| p == recipient);
    require!(allowed, VaultError::NotWhitelisted);
    Ok(())
}
