// Field order must match programs/credit_vault/src/events.rs — Borsh is
// positional, so a reorder here decodes silently into the wrong fields.

use borsh::{BorshDeserialize, BorshSerialize};
use serde::Serialize;

use super::types::PubkeyBytes;
use crate::__anchor_event_disc_impl;

// Must stay in lockstep with credit_vault::state::WHITELIST_LEN; the backend
// doesn't link the on-chain crate, so a drift here truncates decoded events
// silently.
const WHITELIST_LEN: usize = 8;

#[derive(Debug, BorshSerialize, BorshDeserialize, Serialize)]
pub struct VaultCreated {
    pub vault: PubkeyBytes,
    pub owner: PubkeyBytes,
    pub agent: PubkeyBytes,
    pub usdc_mint: PubkeyBytes,
    pub vault_token_account: PubkeyBytes,
    pub slot: u64,
}
__anchor_event_disc_impl!(VaultCreated, "VaultCreated");

#[derive(Debug, BorshSerialize, BorshDeserialize, Serialize)]
pub struct Deposited {
    pub vault: PubkeyBytes,
    pub owner: PubkeyBytes,
    pub amount_usdc: u64,
    pub new_total_deposited: u64,
    pub slot: u64,
}
__anchor_event_disc_impl!(Deposited, "Deposited");

#[derive(Debug, BorshSerialize, BorshDeserialize, Serialize)]
pub struct Spent {
    pub vault: PubkeyBytes,
    pub agent: PubkeyBytes,
    pub service: PubkeyBytes,
    pub amount_usdc: u64,
    pub new_total_spent: u64,
    pub slot: u64,
}
__anchor_event_disc_impl!(Spent, "Spent");

#[derive(Debug, BorshSerialize, BorshDeserialize, Serialize)]
pub struct Claimed {
    pub vault: PubkeyBytes,
    pub service: PubkeyBytes,
    pub amount_usdc: u64,
    pub new_total_spent: u64,
    pub new_total_claimed: u64,
    pub slot: u64,
}
__anchor_event_disc_impl!(Claimed, "Claimed");

#[derive(Debug, BorshSerialize, BorshDeserialize, Serialize)]
pub struct VaultFrozen {
    pub vault: PubkeyBytes,
    pub owner: PubkeyBytes,
    pub slot: u64,
}
__anchor_event_disc_impl!(VaultFrozen, "VaultFrozen");

#[derive(Debug, BorshSerialize, BorshDeserialize, Serialize)]
pub struct VaultUnfrozen {
    pub vault: PubkeyBytes,
    pub owner: PubkeyBytes,
    pub slot: u64,
}
__anchor_event_disc_impl!(VaultUnfrozen, "VaultUnfrozen");

#[derive(Debug, BorshSerialize, BorshDeserialize, Serialize)]
pub struct PolicyUpdated {
    pub vault: PubkeyBytes,
    pub owner: PubkeyBytes,
    pub per_tx_limit_usdc: u64,
    pub hourly_limit_usdc: u64,
    pub lifetime_limit_usdc: u64,
    pub allow_post_pay: bool,
    pub whitelist: [PubkeyBytes; WHITELIST_LEN],
    pub slot: u64,
}
__anchor_event_disc_impl!(PolicyUpdated, "PolicyUpdated");

#[derive(Debug, BorshSerialize, BorshDeserialize, Serialize)]
pub struct Withdrawn {
    pub vault: PubkeyBytes,
    pub owner: PubkeyBytes,
    pub amount_usdc: u64,
    pub new_total_withdrawn: u64,
    pub slot: u64,
}
__anchor_event_disc_impl!(Withdrawn, "Withdrawn");
