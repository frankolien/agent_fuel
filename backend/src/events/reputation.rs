// Field order must match programs/reputation/src/events.rs — Borsh is
// positional, so a reorder here decodes silently into the wrong fields.

use borsh::{BorshDeserialize, BorshSerialize};
use serde::Serialize;

use super::types::{Hash32, NameBytes, PubkeyBytes};
use crate::__anchor_event_disc_impl;

#[derive(Debug, BorshSerialize, BorshDeserialize, Serialize)]
pub struct AgentInitialized {
    pub agent: PubkeyBytes,
    pub owner: PubkeyBytes,
    pub init_slot: u64,
}
__anchor_event_disc_impl!(AgentInitialized, "AgentInitialized");

#[derive(Debug, BorshSerialize, BorshDeserialize, Serialize)]
pub struct ServiceRegistered {
    pub service: PubkeyBytes,
    pub name: NameBytes,
    // 0..=4 — ServiceCategory variant tag from the on-chain `#[repr(u8)]` enum.
    pub category: u8,
    pub init_slot: u64,
}
__anchor_event_disc_impl!(ServiceRegistered, "ServiceRegistered");

#[derive(Debug, BorshSerialize, BorshDeserialize, Serialize)]
pub struct PaymentRecorded {
    pub agent: PubkeyBytes,
    pub service: PubkeyBytes,
    pub amount_usdc: u64,
    pub payment_receipt_hash: Hash32,
    pub was_new_pair: bool,
    pub slot: u64,
}
__anchor_event_disc_impl!(PaymentRecorded, "PaymentRecorded");

#[derive(Debug, BorshSerialize, BorshDeserialize, Serialize)]
pub struct FeedbackGiven {
    pub agent: PubkeyBytes,
    pub service: PubkeyBytes,
    pub feedback: PubkeyBytes,
    pub payment_receipt_hash: Hash32,
    pub value: i8,
    pub tags: u32,
    pub slot: u64,
}
__anchor_event_disc_impl!(FeedbackGiven, "FeedbackGiven");

#[derive(Debug, BorshSerialize, BorshDeserialize, Serialize)]
pub struct ResponseAppended {
    pub agent: PubkeyBytes,
    pub feedback: PubkeyBytes,
    pub responder: PubkeyBytes,
    pub slot: u64,
}
__anchor_event_disc_impl!(ResponseAppended, "ResponseAppended");

#[derive(Debug, BorshSerialize, BorshDeserialize, Serialize)]
pub struct FeedbackRevoked {
    pub agent: PubkeyBytes,
    pub service: PubkeyBytes,
    pub feedback: PubkeyBytes,
    pub was_negative: bool,
    pub slot: u64,
}
__anchor_event_disc_impl!(FeedbackRevoked, "FeedbackRevoked");

#[derive(Debug, BorshSerialize, BorshDeserialize, Serialize)]
pub struct ScoreComputed {
    pub agent: PubkeyBytes,
    pub score: u16,
    pub slot: u64,
}
__anchor_event_disc_impl!(ScoreComputed, "ScoreComputed");
