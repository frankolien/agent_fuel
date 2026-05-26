use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ServiceCategory {
    DataFeed,
    Compute,
    Swap,
    Rpc,
    Other,
}

#[account]
pub struct ServiceRegistry {
    pub authority: Pubkey,
    pub name: [u8; 32],
    pub category: ServiceCategory,
    pub total_agents_served: u64,
    pub total_volume_received_usdc: u64,
    pub active: bool,
    pub first_active_slot: u64,
    pub last_active_slot: u64,
    pub bump: u8,
    pub _padding: [u8; 64],
}

impl ServiceRegistry {
    // 8 disc + 32 + 32 + 1 + 8 + 8 + 1 + 8 + 8 + 1 + 64 = 171
    pub const ACCOUNT_SIZE: usize = 8 + 32 + 32 + 1 + 8 + 8 + 1 + 8 + 8 + 1 + 64;
}

#[account]
pub struct AgentProfile {
    pub authority: Pubkey,
    pub owner: Pubkey,
    pub agent_uri: [u8; 128],
    pub external_agent_id: u64,
    pub total_transactions: u64,
    pub total_volume_usdc: u64,
    pub consecutive_success: u32,
    pub total_feedback_count: u32,
    pub active_negative_feedback_count: u32,
    pub services_used: u16,
    pub first_active_slot: u64,
    pub last_active_slot: u64,
    pub reputation_score: u16,
    pub bump: u8,
    pub _padding: [u8; 64],
}

impl AgentProfile {
    // 8 disc + 32 + 32 + 128 + 8 + 8 + 8 + 4 + 4 + 4 + 2 + 8 + 8 + 2 + 1 + 64 = 321
    pub const ACCOUNT_SIZE: usize =
        8 + 32 + 32 + 128 + 8 + 8 + 8 + 4 + 4 + 4 + 2 + 8 + 8 + 2 + 1 + 64;
}

#[account]
pub struct AgentServiceLink {
    pub agent: Pubkey,
    pub service: Pubkey,
    pub total_transactions: u64,
    pub total_volume_usdc: u64,
    pub first_payment_slot: u64,
    pub last_payment_slot: u64,
    pub bump: u8,
    pub _padding: [u8; 64],
}

impl AgentServiceLink {
    // 8 disc + 32 + 32 + 8 + 8 + 8 + 8 + 1 + 64 = 169
    pub const ACCOUNT_SIZE: usize = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 1 + 64;
}

// Existence-as-signal: a `ReceiptUsed` PDA at `[b"receipt", hash]` proves the
// receipt has been recorded. `record_payment` opens the account with `init`
// (not `init_if_needed`), so a replayed hash fails with `AccountAlreadyInUse`.
// Fields beyond the discriminator are for off-chain auditing.
#[account]
pub struct ReceiptUsed {
    pub receipt_hash: [u8; 32],
    pub agent_service_link: Pubkey,
    pub recorded_slot: u64,
    pub bump: u8,
    pub _padding: [u8; 32],
}

impl ReceiptUsed {
    // 8 disc + 32 + 32 + 8 + 1 + 32 = 113
    pub const ACCOUNT_SIZE: usize = 8 + 32 + 32 + 8 + 1 + 32;
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};

    #[test]
    fn agent_profile_account_size_is_pinned() {
        assert_eq!(AgentProfile::ACCOUNT_SIZE, 321);
    }

    #[test]
    fn agent_profile_discriminator_matches_anchor_format() {
        // Pinning the 8-byte discriminator catches accidental struct renames
        // that would silently break deserialization of already-deployed accounts.
        let mut hasher = Sha256::new();
        hasher.update(b"account:AgentProfile");
        let expected: [u8; 8] = hasher.finalize()[..8].try_into().unwrap();
        assert_eq!(AgentProfile::DISCRIMINATOR, expected);
    }

    #[test]
    fn service_registry_account_size_is_pinned() {
        assert_eq!(ServiceRegistry::ACCOUNT_SIZE, 171);
    }

    #[test]
    fn service_registry_discriminator_matches_anchor_format() {
        let mut hasher = Sha256::new();
        hasher.update(b"account:ServiceRegistry");
        let expected: [u8; 8] = hasher.finalize()[..8].try_into().unwrap();
        assert_eq!(ServiceRegistry::DISCRIMINATOR, expected);
    }

    #[test]
    fn agent_service_link_account_size_is_pinned() {
        assert_eq!(AgentServiceLink::ACCOUNT_SIZE, 169);
    }

    #[test]
    fn agent_service_link_discriminator_matches_anchor_format() {
        let mut hasher = Sha256::new();
        hasher.update(b"account:AgentServiceLink");
        let expected: [u8; 8] = hasher.finalize()[..8].try_into().unwrap();
        assert_eq!(AgentServiceLink::DISCRIMINATOR, expected);
    }

    #[test]
    fn receipt_used_account_size_is_pinned() {
        assert_eq!(ReceiptUsed::ACCOUNT_SIZE, 113);
    }

    #[test]
    fn receipt_used_discriminator_matches_anchor_format() {
        let mut hasher = Sha256::new();
        hasher.update(b"account:ReceiptUsed");
        let expected: [u8; 8] = hasher.finalize()[..8].try_into().unwrap();
        assert_eq!(ReceiptUsed::DISCRIMINATOR, expected);
    }
}
