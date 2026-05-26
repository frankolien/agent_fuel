use serde_json::json;
use sqlx::PgPool;

use crate::notifier::{Alert, AlertKind, Notifier};
use crate::parser::ParsedEvent;

const BUDGET_THRESHOLDS: &[i16] = &[70, 80, 90];

/// Compute the highest budget threshold ≤ `pct`. Returns 0 if `pct` hasn't
/// reached 70.
pub fn threshold_for(pct: i16) -> i16 {
    BUDGET_THRESHOLDS
        .iter()
        .rev()
        .copied()
        .find(|&t| pct >= t)
        .unwrap_or(0)
}

/// Drives all alert decisions for a freshly-ingested webhook batch.
pub async fn dispatch(pool: &PgPool, notifier: &dyn Notifier, events: &[ParsedEvent]) {
    for ev in events {
        match ev.decoded.event_name {
            "Spent" | "Claimed" => {
                if let Err(err) = budget_alert(pool, notifier, ev).await {
                    tracing::warn!(error = %err, sig = %ev.signature, "budget alert failed");
                }
            }
            "ScoreComputed" => {
                if let Err(err) = score_alert(pool, notifier, ev).await {
                    tracing::warn!(error = %err, sig = %ev.signature, "score alert failed");
                }
            }
            _ => {}
        }
    }
}

async fn budget_alert(
    pool: &PgPool,
    notifier: &dyn Notifier,
    ev: &ParsedEvent,
) -> sqlx::Result<()> {
    let Some(vault_pubkey) = ev.decoded.payload["vault"].as_str() else {
        return Ok(());
    };
    let row: Option<(String, i64, i64, i16)> = sqlx::query_as(
        "SELECT owner, total_spent, lifetime_limit_usdc, last_budget_alert_pct \
         FROM vaults WHERE pubkey = $1",
    )
    .bind(vault_pubkey)
    .fetch_optional(pool)
    .await?;
    let Some((owner, total_spent, lifetime_limit, last_alerted)) = row else {
        return Ok(());
    };
    // Lifetime limit of 0 means "no cap" on chain — no thresholds to cross.
    if lifetime_limit <= 0 {
        return Ok(());
    }
    let pct = (i128::from(total_spent) * 100 / i128::from(lifetime_limit)) as i16;
    let new_threshold = threshold_for(pct);
    if new_threshold <= last_alerted {
        return Ok(());
    }

    // Persist the new high-watermark first; if FCM delivery fails the user
    // gets retried next time, but we don't want to spam them with the same
    // threshold across many spends within one webhook batch.
    sqlx::query("UPDATE vaults SET last_budget_alert_pct = $1 WHERE pubkey = $2")
        .bind(new_threshold)
        .bind(vault_pubkey)
        .execute(pool)
        .await?;

    let alert = Alert {
        owner,
        kind: AlertKind::BudgetThreshold,
        title: format!("Vault {new_threshold}% spent"),
        body: format!(
            "Spending has reached {pct}% of the lifetime cap ({total_spent}/{lifetime_limit} USDC lamports)."
        ),
        data: json!({
            "vault": vault_pubkey,
            "threshold_pct": new_threshold,
            "current_pct": pct,
            "total_spent": total_spent,
            "lifetime_limit_usdc": lifetime_limit,
        }),
    };
    notifier.dispatch(&alert).await;
    Ok(())
}

async fn score_alert(pool: &PgPool, notifier: &dyn Notifier, ev: &ParsedEvent) -> sqlx::Result<()> {
    let Some(agent_pubkey) = ev.decoded.payload["agent"].as_str() else {
        return Ok(());
    };
    let Some(new_score) = ev.decoded.payload["score"].as_i64() else {
        return Ok(());
    };
    let owner: Option<(String,)> = sqlx::query_as("SELECT owner FROM agents WHERE pubkey = $1")
        .bind(agent_pubkey)
        .fetch_optional(pool)
        .await?;
    let Some((owner,)) = owner else {
        return Ok(());
    };
    // Find the previous score (excluding this just-inserted slot) to
    // distinguish a meaningful change from a no-op recompute.
    let prev: Option<(i32,)> = sqlx::query_as(
        "SELECT score FROM score_history WHERE agent = $1 AND slot < $2 \
         ORDER BY slot DESC LIMIT 1",
    )
    .bind(agent_pubkey)
    .bind(ev.slot)
    .fetch_optional(pool)
    .await?;
    if matches!(prev, Some((p,)) if p as i64 == new_score) {
        return Ok(());
    }
    let alert = Alert {
        owner,
        kind: AlertKind::ScoreChange,
        title: "Reputation score updated".into(),
        body: match prev {
            Some((p,)) => format!("Score changed from {p} to {new_score}."),
            None => format!("Initial score recorded: {new_score}."),
        },
        data: json!({
            "agent": agent_pubkey,
            "new_score": new_score,
            "previous_score": prev.map(|(p,)| p),
            "slot": ev.slot,
        }),
    };
    notifier.dispatch(&alert).await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn threshold_under_70_returns_zero() {
        assert_eq!(threshold_for(0), 0);
        assert_eq!(threshold_for(50), 0);
        assert_eq!(threshold_for(69), 0);
    }

    #[test]
    fn threshold_picks_highest_crossed() {
        assert_eq!(threshold_for(70), 70);
        assert_eq!(threshold_for(75), 70);
        assert_eq!(threshold_for(80), 80);
        assert_eq!(threshold_for(85), 80);
        assert_eq!(threshold_for(90), 90);
        assert_eq!(threshold_for(100), 90);
        assert_eq!(threshold_for(150), 90); // over-spend stays clamped
    }

    #[test]
    fn thresholds_are_in_ascending_order() {
        let mut sorted = BUDGET_THRESHOLDS.to_vec();
        sorted.sort();
        assert_eq!(sorted, BUDGET_THRESHOLDS);
    }
}
