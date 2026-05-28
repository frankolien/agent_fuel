use sqlx::PgPool;
use std::collections::HashSet;

use crate::parser::ParsedEvent;

#[derive(Default)]
pub struct Affected {
    pub agents: HashSet<String>,
    pub services: HashSet<String>,
    pub vaults: HashSet<String>,
}

/// Maps each freshly-ingested event to the mirror rows it could touch.
pub fn affected(events: &[ParsedEvent]) -> Affected {
    let mut a = Affected::default();
    for ev in events {
        let p = &ev.decoded.payload;
        match ev.decoded.event_name {
            "AgentInitialized" | "FeedbackGiven" | "ResponseAppended" | "FeedbackRevoked"
            | "ScoreComputed" => {
                if let Some(s) = p["agent"].as_str() {
                    a.agents.insert(s.to_owned());
                }
            }
            "ServiceRegistered" | "ServiceActiveSet" => {
                if let Some(s) = p["service"].as_str() {
                    a.services.insert(s.to_owned());
                }
            }
            "PaymentRecorded" => {
                if let Some(s) = p["agent"].as_str() {
                    a.agents.insert(s.to_owned());
                }
                if let Some(s) = p["service"].as_str() {
                    a.services.insert(s.to_owned());
                }
            }
            "VaultCreated" | "Deposited" | "Spent" | "Claimed" | "VaultFrozen"
            | "VaultUnfrozen" | "PolicyUpdated" | "Withdrawn" => {
                if let Some(s) = p["vault"].as_str() {
                    a.vaults.insert(s.to_owned());
                }
            }
            _ => {}
        }
    }
    a
}

pub async fn refresh(pool: &PgPool, affected: &Affected) -> sqlx::Result<()> {
    for pubkey in &affected.agents {
        refresh_agent(pool, pubkey).await?;
    }
    for pubkey in &affected.services {
        refresh_service(pool, pubkey).await?;
    }
    for pubkey in &affected.vaults {
        refresh_vault(pool, pubkey).await?;
    }
    Ok(())
}

// Each refresh function is "rebuild from events" so replays converge to the
// same row state regardless of arrival order. The `WHERE EXISTS` guard skips
// rows we've never seen an init event for — Helius can deliver downstream
// events before the init in pathological cases, but we'd rather drop the
// late-arrival than insert with placeholder values.

async fn refresh_agent(pool: &PgPool, pubkey: &str) -> sqlx::Result<()> {
    sqlx::query(
        r#"
        INSERT INTO agents (
            pubkey, owner, init_slot, score,
            total_transactions, total_volume_usdc, services_used,
            consecutive_success,
            total_feedback_count, active_negative_feedback_count,
            last_active_slot, updated_at
        )
        SELECT
            $1,
            init.payload->>'owner',
            (init.payload->>'init_slot')::bigint,
            COALESCE((
                SELECT (payload->>'score')::int FROM events
                WHERE event_name = 'ScoreComputed' AND payload->>'agent' = $1
                ORDER BY slot DESC, log_index DESC LIMIT 1
            ), 0),
            COALESCE((SELECT COUNT(*) FROM events
                WHERE event_name = 'PaymentRecorded' AND payload->>'agent' = $1), 0),
            COALESCE((SELECT SUM((payload->>'amount_usdc')::bigint) FROM events
                WHERE event_name = 'PaymentRecorded' AND payload->>'agent' = $1), 0),
            COALESCE((SELECT COUNT(*) FROM events
                WHERE event_name = 'PaymentRecorded' AND payload->>'agent' = $1
                  AND (payload->>'was_new_pair')::boolean = TRUE), 0),
            -- Payments since the latest unrevoked negative feedback.
            COALESCE((
                SELECT COUNT(*) FROM events p
                WHERE p.event_name = 'PaymentRecorded' AND p.payload->>'agent' = $1
                  AND (p.slot, p.log_index) > COALESCE((
                    SELECT (fg.slot, fg.log_index) FROM events fg
                    WHERE fg.event_name = 'FeedbackGiven'
                      AND fg.payload->>'agent' = $1
                      AND (fg.payload->>'value')::int < 0
                      AND NOT EXISTS (
                        SELECT 1 FROM events fr
                        WHERE fr.event_name = 'FeedbackRevoked'
                          AND fr.payload->>'feedback' = fg.payload->>'feedback'
                      )
                    ORDER BY fg.slot DESC, fg.log_index DESC LIMIT 1
                  ), (-1::bigint, -1))
            ), 0),
            COALESCE((SELECT COUNT(*) FROM events
                WHERE event_name = 'FeedbackGiven' AND payload->>'agent' = $1), 0)
                - COALESCE((SELECT COUNT(*) FROM events
                WHERE event_name = 'FeedbackRevoked' AND payload->>'agent' = $1), 0),
            GREATEST(0,
                COALESCE((SELECT COUNT(*) FROM events
                    WHERE event_name = 'FeedbackGiven' AND payload->>'agent' = $1
                      AND (payload->>'value')::int < 0), 0)
                - COALESCE((SELECT COUNT(*) FROM events
                    WHERE event_name = 'FeedbackRevoked' AND payload->>'agent' = $1
                      AND (payload->>'was_negative')::boolean = TRUE), 0)
            ),
            COALESCE((SELECT MAX(slot) FROM events
                WHERE payload->>'agent' = $1), (init.payload->>'init_slot')::bigint),
            now()
        FROM events init
        WHERE init.event_name = 'AgentInitialized' AND init.payload->>'agent' = $1
        ORDER BY init.slot ASC, init.log_index ASC
        LIMIT 1
        ON CONFLICT (pubkey) DO UPDATE SET
            score                          = EXCLUDED.score,
            total_transactions             = EXCLUDED.total_transactions,
            total_volume_usdc              = EXCLUDED.total_volume_usdc,
            services_used                  = EXCLUDED.services_used,
            consecutive_success            = EXCLUDED.consecutive_success,
            total_feedback_count           = EXCLUDED.total_feedback_count,
            active_negative_feedback_count = EXCLUDED.active_negative_feedback_count,
            last_active_slot               = EXCLUDED.last_active_slot,
            updated_at                     = now()
        "#,
    )
    .bind(pubkey)
    .execute(pool)
    .await?;
    Ok(())
}

async fn refresh_service(pool: &PgPool, pubkey: &str) -> sqlx::Result<()> {
    sqlx::query(
        r#"
        INSERT INTO services (
            pubkey, name, category, active, init_slot,
            total_agents_served, total_volume_received_usdc,
            last_active_slot, updated_at
        )
        SELECT
            $1,
            init.payload->>'name',
            (init.payload->>'category')::smallint,
            -- Active starts TRUE at registration; flipped by ServiceActiveSet.
            -- Latest active-set event wins; if none, default to TRUE.
            COALESCE((
                SELECT (payload->>'active')::boolean FROM events
                WHERE event_name = 'ServiceActiveSet' AND payload->>'service' = $1
                ORDER BY slot DESC, log_index DESC LIMIT 1
            ), TRUE),
            (init.payload->>'init_slot')::bigint,
            COALESCE((SELECT COUNT(*) FROM events
                WHERE event_name = 'PaymentRecorded'
                  AND payload->>'service' = $1
                  AND (payload->>'was_new_pair')::boolean = TRUE), 0),
            COALESCE((SELECT SUM((payload->>'amount_usdc')::bigint) FROM events
                WHERE event_name = 'PaymentRecorded' AND payload->>'service' = $1), 0),
            COALESCE((SELECT MAX(slot) FROM events
                WHERE payload->>'service' = $1), (init.payload->>'init_slot')::bigint),
            now()
        FROM events init
        WHERE init.event_name = 'ServiceRegistered' AND init.payload->>'service' = $1
        ORDER BY init.slot ASC, init.log_index ASC
        LIMIT 1
        ON CONFLICT (pubkey) DO UPDATE SET
            name                       = EXCLUDED.name,
            category                   = EXCLUDED.category,
            active                     = EXCLUDED.active,
            total_agents_served        = EXCLUDED.total_agents_served,
            total_volume_received_usdc = EXCLUDED.total_volume_received_usdc,
            last_active_slot           = EXCLUDED.last_active_slot,
            updated_at                 = now()
        "#,
    )
    .bind(pubkey)
    .execute(pool)
    .await?;
    Ok(())
}

async fn refresh_vault(pool: &PgPool, pubkey: &str) -> sqlx::Result<()> {
    // Counter fields use MAX(new_total_*) — each event carries the
    // post-change value, so the latest value is the largest by ordering.
    sqlx::query(
        r#"
        INSERT INTO vaults (
            pubkey, owner, agent, usdc_mint, vault_token_account,
            total_deposited, total_withdrawn, total_spent, total_claimed,
            frozen,
            per_tx_limit_usdc, hourly_limit_usdc, lifetime_limit_usdc, allow_post_pay,
            whitelist,
            created_slot, last_active_slot, updated_at
        )
        SELECT
            $1,
            init.payload->>'owner',
            init.payload->>'agent',
            init.payload->>'usdc_mint',
            init.payload->>'vault_token_account',
            COALESCE((SELECT MAX((payload->>'new_total_deposited')::bigint) FROM events
                WHERE event_name = 'Deposited' AND payload->>'vault' = $1), 0),
            COALESCE((SELECT MAX((payload->>'new_total_withdrawn')::bigint) FROM events
                WHERE event_name = 'Withdrawn' AND payload->>'vault' = $1), 0),
            COALESCE((SELECT MAX(spent) FROM (
                SELECT (payload->>'new_total_spent')::bigint AS spent FROM events
                WHERE event_name IN ('Spent', 'Claimed') AND payload->>'vault' = $1
            ) s), 0),
            COALESCE((SELECT MAX((payload->>'new_total_claimed')::bigint) FROM events
                WHERE event_name = 'Claimed' AND payload->>'vault' = $1), 0),
            COALESCE((
                SELECT event_name = 'VaultFrozen' FROM events
                WHERE event_name IN ('VaultFrozen', 'VaultUnfrozen')
                  AND payload->>'vault' = $1
                ORDER BY slot DESC, log_index DESC LIMIT 1
            ), FALSE),
            COALESCE((
                SELECT (payload->>'per_tx_limit_usdc')::bigint FROM events
                WHERE event_name = 'PolicyUpdated' AND payload->>'vault' = $1
                ORDER BY slot DESC, log_index DESC LIMIT 1
            ), 0),
            COALESCE((
                SELECT (payload->>'hourly_limit_usdc')::bigint FROM events
                WHERE event_name = 'PolicyUpdated' AND payload->>'vault' = $1
                ORDER BY slot DESC, log_index DESC LIMIT 1
            ), 0),
            COALESCE((
                SELECT (payload->>'lifetime_limit_usdc')::bigint FROM events
                WHERE event_name = 'PolicyUpdated' AND payload->>'vault' = $1
                ORDER BY slot DESC, log_index DESC LIMIT 1
            ), 0),
            COALESCE((
                SELECT (payload->>'allow_post_pay')::boolean FROM events
                WHERE event_name = 'PolicyUpdated' AND payload->>'vault' = $1
                ORDER BY slot DESC, log_index DESC LIMIT 1
            ), FALSE),
            -- Whitelist: the latest PolicyUpdated emits a fixed-size 8-element
            -- array with empty slots set to Pubkey::default(); filter those out
            -- so consumers see only the meaningful entries.
            COALESCE((
                SELECT ARRAY(
                    SELECT v FROM jsonb_array_elements_text(p.payload->'whitelist') v
                    WHERE v != '11111111111111111111111111111111'
                )
                FROM events p
                WHERE p.event_name = 'PolicyUpdated' AND p.payload->>'vault' = $1
                ORDER BY p.slot DESC, p.log_index DESC LIMIT 1
            ), ARRAY[]::TEXT[]),
            (init.payload->>'slot')::bigint,
            COALESCE((SELECT MAX(slot) FROM events
                WHERE payload->>'vault' = $1), (init.payload->>'slot')::bigint),
            now()
        FROM events init
        WHERE init.event_name = 'VaultCreated' AND init.payload->>'vault' = $1
        ORDER BY init.slot ASC, init.log_index ASC
        LIMIT 1
        ON CONFLICT (pubkey) DO UPDATE SET
            total_deposited     = EXCLUDED.total_deposited,
            total_withdrawn     = EXCLUDED.total_withdrawn,
            total_spent         = EXCLUDED.total_spent,
            total_claimed       = EXCLUDED.total_claimed,
            frozen              = EXCLUDED.frozen,
            per_tx_limit_usdc   = EXCLUDED.per_tx_limit_usdc,
            hourly_limit_usdc   = EXCLUDED.hourly_limit_usdc,
            lifetime_limit_usdc = EXCLUDED.lifetime_limit_usdc,
            allow_post_pay      = EXCLUDED.allow_post_pay,
            whitelist           = EXCLUDED.whitelist,
            last_active_slot    = EXCLUDED.last_active_slot,
            updated_at          = now()
        "#,
    )
    .bind(pubkey)
    .execute(pool)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::DecodedEvent;
    use serde_json::json;

    fn fake(name: &'static str, payload: serde_json::Value) -> ParsedEvent {
        ParsedEvent {
            signature: "s".into(),
            slot: 1,
            log_index: 0,
            program_id: "prog".into(),
            decoded: DecodedEvent {
                event_name: name,
                payload,
            },
        }
    }

    #[test]
    fn payment_recorded_touches_both_agent_and_service() {
        let events = vec![fake(
            "PaymentRecorded",
            json!({ "agent": "A", "service": "S", "amount_usdc": 1 }),
        )];
        let a = affected(&events);
        assert!(a.agents.contains("A"));
        assert!(a.services.contains("S"));
        assert!(a.vaults.is_empty());
    }

    #[test]
    fn vault_events_only_touch_vaults() {
        let events = vec![
            fake("Deposited", json!({ "vault": "V1" })),
            fake("Spent", json!({ "vault": "V2" })),
            fake("VaultFrozen", json!({ "vault": "V1" })),
        ];
        let a = affected(&events);
        assert_eq!(a.vaults.len(), 2);
        assert!(a.agents.is_empty());
        assert!(a.services.is_empty());
    }

    #[test]
    fn agent_events_only_touch_agents() {
        let events = vec![
            fake("AgentInitialized", json!({ "agent": "A" })),
            fake("FeedbackGiven", json!({ "agent": "A" })),
            fake("ScoreComputed", json!({ "agent": "B" })),
        ];
        let a = affected(&events);
        assert_eq!(a.agents.len(), 2);
        assert!(a.services.is_empty());
        assert!(a.vaults.is_empty());
    }

    #[test]
    fn unknown_event_name_is_ignored() {
        let events = vec![fake("WhoKnows", json!({ "agent": "A" }))];
        let a = affected(&events);
        assert!(a.agents.is_empty() && a.services.is_empty() && a.vaults.is_empty());
    }

    #[test]
    fn dedupes_within_batch() {
        let events = vec![
            fake("AgentInitialized", json!({ "agent": "A" })),
            fake("ScoreComputed", json!({ "agent": "A" })),
            fake("FeedbackGiven", json!({ "agent": "A" })),
        ];
        let a = affected(&events);
        assert_eq!(a.agents.len(), 1);
    }
}
