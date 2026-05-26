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
