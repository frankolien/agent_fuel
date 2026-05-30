use anchor_lang::prelude::*;

use crate::state::WHITELIST_LEN;

#[event]
pub struct VaultCreated {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub usdc_mint: Pubkey,
    pub vault_token_account: Pubkey,
    pub slot: u64,
}

#[event]
pub struct Deposited {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub amount_usdc: u64,
    pub new_total_deposited: u64,
    pub slot: u64,
}

#[event]
pub struct Spent {
    pub vault: Pubkey,
    pub agent: Pubkey,
    pub service: Pubkey,
    pub amount_usdc: u64,
    pub new_total_spent: u64,
    pub slot: u64,
}

#[event]
pub struct Claimed {
    pub vault: Pubkey,
    pub service: Pubkey,
    pub amount_usdc: u64,
    pub new_total_spent: u64,
    pub new_total_claimed: u64,
    pub slot: u64,
}

#[event]
pub struct VaultFrozen {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub slot: u64,
}

#[event]
pub struct VaultUnfrozen {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub slot: u64,
}

#[event]
pub struct PolicyUpdated {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub per_tx_limit_usdc: u64,
    pub hourly_limit_usdc: u64,
    pub lifetime_limit_usdc: u64,
    pub allow_post_pay: bool,
    pub whitelist: [Pubkey; WHITELIST_LEN],
    pub slot: u64,
}

#[event]
pub struct Withdrawn {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub amount_usdc: u64,
    pub new_total_withdrawn: u64,
    pub slot: u64,
}

#[event]
pub struct SpendRequested {
    pub vault: Pubkey,
    pub agent: Pubkey,
    pub service: Pubkey,
    pub pending_spend: Pubkey,
    pub amount_usdc: u64,
    pub nonce: u64,
    pub slot: u64,
}

#[event]
pub struct SpendRejected {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub pending_spend: Pubkey,
    pub nonce: u64,
    pub slot: u64,
}
