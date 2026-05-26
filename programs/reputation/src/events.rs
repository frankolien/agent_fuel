use anchor_lang::prelude::*;

#[event]
pub struct AgentInitialized {
    pub agent: Pubkey,
    pub owner: Pubkey,
    pub init_slot: u64,
}
