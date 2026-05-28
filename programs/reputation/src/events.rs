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
    /// Wallet that paid rent. Lets us answer "who registered this service?"
    /// without an extra column on the on-chain account.
    pub sponsor: Pubkey,
    pub name: [u8; 32],
    pub category: ServiceCategory,
    pub init_slot: u64,
}

#[event]
pub struct ServiceActiveSet {
    pub service: Pubkey,
    pub active: bool,
    pub slot: u64,
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

#[event]
pub struct FeedbackGiven {
    pub agent: Pubkey,
    pub service: Pubkey,
    pub feedback: Pubkey,
    pub payment_receipt_hash: [u8; 32],
    pub value: i8,
    pub tags: u32,
    pub slot: u64,
}

#[event]
pub struct ResponseAppended {
    pub agent: Pubkey,
    pub feedback: Pubkey,
    pub responder: Pubkey,
    pub slot: u64,
}

#[event]
pub struct FeedbackRevoked {
    pub agent: Pubkey,
    pub service: Pubkey,
    pub feedback: Pubkey,
    pub was_negative: bool,
    pub slot: u64,
}

#[event]
pub struct ScoreComputed {
    pub agent: Pubkey,
    pub score: u16,
    pub slot: u64,
}
