pub mod discriminators;
pub mod reputation;
pub mod types;
pub mod vault;

use borsh::BorshDeserialize;
use discriminators::EventDescriptor;
use serde_json::Value;

#[derive(Debug, thiserror::Error)]
pub enum DecodeError {
    #[error("payload shorter than 8-byte discriminator")]
    TooShort,
    #[error("borsh decode failed for {event}: {source}")]
    Borsh {
        event: &'static str,
        #[source]
        source: std::io::Error,
    },
    #[error("event serialization to JSON failed: {0}")]
    Serialize(#[from] serde_json::Error),
}

#[derive(Debug)]
pub struct DecodedEvent {
    pub event_name: &'static str,
    pub payload: Value,
}

/// `Ok(None)` for discriminators we don't own — other programs' events
/// reach us via CPI and must not error the pipeline.
pub fn decode(raw: &[u8]) -> Result<Option<DecodedEvent>, DecodeError> {
    if raw.len() < 8 {
        return Err(DecodeError::TooShort);
    }
    let mut disc = [0u8; 8];
    disc.copy_from_slice(&raw[..8]);
    let body = &raw[8..];

    macro_rules! dispatch {
        ($( $ty:path ),* $(,)?) => {
            $(
                if disc == <$ty>::discriminator() {
                    let decoded = <$ty>::try_from_slice(body).map_err(|e| DecodeError::Borsh {
                        event: <$ty as EventDescriptor>::NAME,
                        source: e,
                    })?;
                    let payload = serde_json::to_value(decoded)?;
                    return Ok(Some(DecodedEvent {
                        event_name: <$ty as EventDescriptor>::NAME,
                        payload,
                    }));
                }
            )*
        };
    }

    dispatch!(
        reputation::AgentInitialized,
        reputation::ServiceRegistered,
        reputation::ServiceActiveSet,
        reputation::PaymentRecorded,
        reputation::FeedbackGiven,
        reputation::ResponseAppended,
        reputation::FeedbackRevoked,
        reputation::ScoreComputed,
        vault::VaultCreated,
        vault::Deposited,
        vault::Spent,
        vault::Claimed,
        vault::VaultFrozen,
        vault::VaultUnfrozen,
        vault::PolicyUpdated,
        vault::Withdrawn,
    );

    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::discriminators::{anchor_event_discriminator, EventDescriptor};
    use super::*;
    use borsh::BorshSerialize;

    fn encode<T: BorshSerialize + EventDescriptor>(body: &T) -> Vec<u8> {
        let mut out = T::discriminator().to_vec();
        body.serialize(&mut out).unwrap();
        out
    }

    #[test]
    fn discriminator_formula_matches_anchor_spec() {
        let disc = anchor_event_discriminator("AgentInitialized");
        let mut hasher = sha2::Sha256::default();
        sha2::Digest::update(&mut hasher, b"event:AgentInitialized");
        let expected = &sha2::Digest::finalize(hasher)[..8];
        assert_eq!(&disc[..], expected);
    }

    #[test]
    fn discriminators_are_disjoint_across_events() {
        let names: &[[u8; 8]] = &[
            reputation::AgentInitialized::discriminator(),
            reputation::ServiceRegistered::discriminator(),
            reputation::ServiceActiveSet::discriminator(),
            reputation::PaymentRecorded::discriminator(),
            reputation::FeedbackGiven::discriminator(),
            reputation::ResponseAppended::discriminator(),
            reputation::FeedbackRevoked::discriminator(),
            reputation::ScoreComputed::discriminator(),
            vault::VaultCreated::discriminator(),
            vault::Deposited::discriminator(),
            vault::Spent::discriminator(),
            vault::Claimed::discriminator(),
            vault::VaultFrozen::discriminator(),
            vault::VaultUnfrozen::discriminator(),
            vault::PolicyUpdated::discriminator(),
            vault::Withdrawn::discriminator(),
        ];
        let mut set = std::collections::HashSet::new();
        for d in names {
            assert!(set.insert(*d), "duplicate discriminator: {d:?}");
        }
    }

    #[derive(BorshSerialize)]
    struct AgentInitWire {
        agent: [u8; 32],
        owner: [u8; 32],
        init_slot: u64,
    }

    #[test]
    fn decodes_agent_initialized_round_trip() {
        let wire = AgentInitWire {
            agent: [1u8; 32],
            owner: [2u8; 32],
            init_slot: 12345,
        };
        let mut raw = reputation::AgentInitialized::discriminator().to_vec();
        wire.serialize(&mut raw).unwrap();

        let decoded = decode(&raw).unwrap().expect("must dispatch");
        assert_eq!(decoded.event_name, "AgentInitialized");
        assert_eq!(decoded.payload["init_slot"], 12345);
        assert_eq!(
            decoded.payload["agent"].as_str().unwrap(),
            bs58::encode([1u8; 32]).into_string()
        );
    }

    #[derive(BorshSerialize)]
    struct SpentWire {
        vault: [u8; 32],
        agent: [u8; 32],
        service: [u8; 32],
        amount_usdc: u64,
        new_total_spent: u64,
        slot: u64,
    }

    #[test]
    fn decodes_spent_with_amounts_intact() {
        let wire = SpentWire {
            vault: [3u8; 32],
            agent: [4u8; 32],
            service: [5u8; 32],
            amount_usdc: 1_000_000,
            new_total_spent: 5_000_000,
            slot: 999,
        };
        let mut raw = vault::Spent::discriminator().to_vec();
        wire.serialize(&mut raw).unwrap();

        let decoded = decode(&raw).unwrap().expect("must dispatch");
        assert_eq!(decoded.event_name, "Spent");
        assert_eq!(decoded.payload["amount_usdc"], 1_000_000);
        assert_eq!(decoded.payload["new_total_spent"], 5_000_000);
        assert_eq!(decoded.payload["slot"], 999);
    }

    #[derive(BorshSerialize)]
    struct ServiceRegWire {
        service: [u8; 32],
        sponsor: [u8; 32],
        name: [u8; 32],
        category: u8,
        init_slot: u64,
    }

    #[test]
    fn decodes_service_registered_with_utf8_name_trim() {
        let mut name = [0u8; 32];
        name[..6].copy_from_slice(b"oracle");
        let wire = ServiceRegWire {
            service: [7u8; 32],
            sponsor: [8u8; 32],
            name,
            category: 0,
            init_slot: 100,
        };
        let mut raw = reputation::ServiceRegistered::discriminator().to_vec();
        wire.serialize(&mut raw).unwrap();

        let decoded = decode(&raw).unwrap().expect("must dispatch");
        assert_eq!(decoded.payload["name"], "oracle");
        assert_eq!(decoded.payload["category"], 0);
        assert_eq!(
            decoded.payload["sponsor"].as_str().unwrap(),
            bs58::encode([8u8; 32]).into_string()
        );
    }

    #[test]
    fn decode_returns_none_for_unknown_discriminator() {
        let mut raw = [0u8; 16].to_vec();
        raw[..8].copy_from_slice(b"\xff\xff\xff\xff\xff\xff\xff\xff");
        assert!(decode(&raw).unwrap().is_none());
    }

    #[test]
    fn decode_errors_on_short_payload() {
        let raw = [0u8; 4];
        assert!(matches!(decode(&raw), Err(DecodeError::TooShort)));
    }

    #[test]
    fn decode_errors_on_truncated_body() {
        let mut raw = reputation::AgentInitialized::discriminator().to_vec();
        raw.extend_from_slice(&[0u8; 60]);
        assert!(matches!(decode(&raw), Err(DecodeError::Borsh { .. })));
    }

    #[test]
    fn decodes_policy_updated_with_whitelist_array() {
        #[derive(BorshSerialize)]
        struct PolicyWire {
            vault: [u8; 32],
            owner: [u8; 32],
            per_tx_limit_usdc: u64,
            hourly_limit_usdc: u64,
            lifetime_limit_usdc: u64,
            allow_post_pay: bool,
            whitelist: [[u8; 32]; 8],
            slot: u64,
        }
        let mut whitelist = [[0u8; 32]; 8];
        whitelist[3] = [9u8; 32];
        let wire = PolicyWire {
            vault: [1u8; 32],
            owner: [2u8; 32],
            per_tx_limit_usdc: 1_000_000,
            hourly_limit_usdc: 10_000_000,
            lifetime_limit_usdc: 100_000_000,
            allow_post_pay: true,
            whitelist,
            slot: 42,
        };
        let mut raw = vault::PolicyUpdated::discriminator().to_vec();
        wire.serialize(&mut raw).unwrap();

        let decoded = decode(&raw).unwrap().expect("must dispatch");
        assert_eq!(decoded.event_name, "PolicyUpdated");
        assert_eq!(decoded.payload["allow_post_pay"], true);
        assert_eq!(decoded.payload["whitelist"].as_array().unwrap().len(), 8);
        assert_eq!(
            decoded.payload["whitelist"][3].as_str().unwrap(),
            bs58::encode([9u8; 32]).into_string()
        );
    }

    #[test]
    fn full_round_trip_via_encode_helper() {
        let event = reputation::ScoreComputed {
            agent: super::types::PubkeyBytes([8u8; 32]),
            score: 750,
            slot: 1_000_000,
        };
        let raw = encode(&event);
        let decoded = decode(&raw).unwrap().expect("must dispatch");
        assert_eq!(decoded.event_name, "ScoreComputed");
        assert_eq!(decoded.payload["score"], 750);
        assert_eq!(decoded.payload["slot"], 1_000_000);
    }
}
