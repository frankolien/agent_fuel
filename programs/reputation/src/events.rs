use anchor_lang::prelude::*;

use crate::state::ServiceCategory;

#[event]
pub struct AgentInitialized {
    pub agent: Pubkey,
    pub owner: Pubkey,
    pub init_slot: u64,
}

#[event]
pub struct ServiceRegistered {
    pub service: Pubkey,
    pub name: [u8; 32],
    pub category: ServiceCategory,
    pub init_slot: u64,
}

#[event]
pub struct PaymentRecorded {
    pub agent: Pubkey,
    pub service: Pubkey,
    pub amount_usdc: u64,
    pub payment_receipt_hash: [u8; 32],
    pub was_new_pair: bool,
    pub slot: u64,
}
