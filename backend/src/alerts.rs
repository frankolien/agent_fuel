use serde_json::json;
use sqlx::PgPool;

use crate::notifier::{Alert, AlertKind, AlertSeverity, Notifier};
use crate::parser::ParsedEvent;
use crate::ws_hub::{alerts_key, WsHub};

const BUDGET_THRESHOLDS: &[i16] = &[70, 80, 90];
const ELITE_TIER: i64 = 900;

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
pub async fn dispatch(
    pool: &PgPool,
    notifier: &dyn Notifier,
    hub: &WsHub,
    events: &[ParsedEvent],
) {
    for ev in events {
        let result = match ev.decoded.event_name {
            "Spent" => {
                // Spent fires both for direct spends and for approve_spend
                // (which CPI-transfers the queued pending). Run both: the
                // verdict mirror is a no-op if no pending row matches.
                let a = spend_approved_mirror(pool, notifier, hub, ev).await;
                let b = budget_alert(pool, notifier, hub, ev).await;
                a.and(b)
            }
            "Claimed" => budget_alert(pool, notifier, hub, ev).await,
            "ScoreComputed" => score_alert(pool, notifier, hub, ev).await,
            "Deposited" => deposit_alert(pool, notifier, hub, ev).await,
            "VaultFrozen" => freeze_alert(pool, notifier, hub, ev).await,
            "SpendRequested" => spend_requested_alert(pool, notifier, hub, ev).await,
            "SpendRejected" => spend_rejected_mirror(pool, notifier, hub, ev).await,
            _ => Ok(()),
        };
        if let Err(err) = result {
            tracing::warn!(
                error = %err,
                sig = %ev.signature,
                event = ev.decoded.event_name,
                "alert dispatch failed"
            );
        }
    }
}

/// Persists the alert (so the mobile Alerts tab can list/dedupe it), pushes
/// it to any WebSocket subscriber on `alerts:<owner>`, and forwards to the
/// platform notifier (FCM/log). Returns the new alert id so callers that
/// want to surface it in API responses can.
pub async fn emit(
    pool: &PgPool,
    notifier: &dyn Notifier,
    hub: &WsHub,
    alert: Alert,
) -> sqlx::Result<i64> {
    let row: (i64, chrono::DateTime<chrono::Utc>) = sqlx::query_as(
        "INSERT INTO alerts (owner, kind, severity, title, body, data) \
         VALUES ($1, $2, $3, $4, $5, $6) \
         RETURNING id, created_at",
    )
    .bind(&alert.owner)
    .bind(alert.kind.as_str())
    .bind(alert.severity.as_str())
    .bind(&alert.title)
    .bind(&alert.body)
    .bind(&alert.data)
    .fetch_one(pool)
    .await?;

    let payload = json!({
        "id": row.0,
        "owner": alert.owner,
        "kind": alert.kind.as_str(),
        "severity": alert.severity.as_str(),
        "title": alert.title,
        "body": alert.body,
        "data": alert.data,
        "created_at": row.1,
        "read_at": serde_json::Value::Null,
    })
    .to_string();
    hub.broadcast(&alerts_key(&alert.owner), &payload);

    notifier.dispatch(&alert).await;
    Ok(row.0)
}

async fn budget_alert(
    pool: &PgPool,
    notifier: &dyn Notifier,
    hub: &WsHub,
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

    let severity = if new_threshold >= 90 {
        AlertSeverity::Urgent
    } else {
        AlertSeverity::Info
    };
    emit(
        pool,
        notifier,
        hub,
        Alert {
            owner,
            kind: AlertKind::BudgetThreshold,
            severity,
            title: format!("Vault {new_threshold}% spent"),
            body: format!(
                "Spending reached {pct}% of the lifetime cap ({total_spent}/{lifetime_limit} USDC lamports)."
            ),
            data: json!({
                "vault": vault_pubkey,
                "threshold_pct": new_threshold,
                "current_pct": pct,
                "total_spent": total_spent,
                "lifetime_limit_usdc": lifetime_limit,
            }),
        },
    )
    .await?;
    Ok(())
}

async fn score_alert(
    pool: &PgPool,
    notifier: &dyn Notifier,
    hub: &WsHub,
    ev: &ParsedEvent,
) -> sqlx::Result<()> {
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
    let prev_score = prev.map(|(p,)| p as i64);
    if matches!(prev_score, Some(p) if p == new_score) {
        return Ok(());
    }
    let delta = new_score - prev_score.unwrap_or(0);
    let crossed_elite = matches!(prev_score, Some(p) if p < ELITE_TIER) && new_score >= ELITE_TIER;
    let urgent_drop = delta <= -15;
    let severity = if urgent_drop {
        AlertSeverity::Urgent
    } else {
        AlertSeverity::Info
    };
    let (kind, title, body) = if crossed_elite {
        (
            AlertKind::TierCrossed,
            "Agent crossed Elite tier".to_string(),
            format!("Reputation reached {new_score}. Post-pay credit unlocks for whitelisted services."),
        )
    } else if urgent_drop {
        (
            AlertKind::ScoreChange,
            format!("Reputation dropped {} pts", delta.abs()),
            format!(
                "Score fell from {} to {new_score}. Consider freezing the vault until things stabilize.",
                prev_score.unwrap_or(0)
            ),
        )
    } else {
        (
            AlertKind::ScoreChange,
            "Reputation score updated".to_string(),
            match prev_score {
                Some(p) => format!("Score moved from {p} to {new_score}."),
                None => format!("Initial score recorded: {new_score}."),
            },
        )
    };

    emit(
        pool,
        notifier,
        hub,
        Alert {
            owner,
            kind,
            severity,
            title,
            body,
            data: json!({
                "agent": agent_pubkey,
                "new_score": new_score,
                "previous_score": prev_score,
                "delta": delta,
                "slot": ev.slot,
            }),
        },
    )
    .await?;
    Ok(())
}

async fn deposit_alert(
    pool: &PgPool,
    notifier: &dyn Notifier,
    hub: &WsHub,
    ev: &ParsedEvent,
) -> sqlx::Result<()> {
    let Some(vault_pubkey) = ev.decoded.payload["vault"].as_str() else {
        return Ok(());
    };
    let Some(amount) = ev.decoded.payload["amount_usdc"].as_i64() else {
        return Ok(());
    };
    let Some(owner) = ev.decoded.payload["owner"].as_str() else {
        return Ok(());
    };
    let usdc = amount as f64 / 1_000_000.0;
    emit(
        pool,
        notifier,
        hub,
        Alert {
            owner: owner.to_string(),
            kind: AlertKind::VaultFunded,
            severity: AlertSeverity::Info,
            title: format!("Vault funded · {usdc:.2} USDC"),
            body: format!(
                "A deposit just landed on chain. Vault {} top-up confirmed.",
                short(vault_pubkey)
            ),
            data: json!({
                "vault": vault_pubkey,
                "amount_usdc_lamports": amount,
                "amount_usdc": usdc,
                "slot": ev.slot,
            }),
        },
    )
    .await?;
    Ok(())
}

/// Mirrors the `POST /api/spends/request` endpoint but driven by the
/// on-chain `SpendRequested` event from `credit_vault`'s approve-spend
/// flow. Persists a `pending_spends` row so the existing approve/reject
/// HTTP endpoints can decide it, and fires an urgent ApprovalRequired
/// alert via the standard pipeline (DB + WS + notifier).
async fn spend_requested_alert(
    pool: &PgPool,
    notifier: &dyn Notifier,
    hub: &WsHub,
    ev: &ParsedEvent,
) -> sqlx::Result<()> {
    let Some(vault_pubkey) = ev.decoded.payload["vault"].as_str() else {
        return Ok(());
    };
    let Some(agent_pubkey) = ev.decoded.payload["agent"].as_str() else {
        return Ok(());
    };
    let Some(service_pubkey) = ev.decoded.payload["service"].as_str() else {
        return Ok(());
    };
    let Some(amount) = ev.decoded.payload["amount_usdc"].as_i64() else {
        return Ok(());
    };

    // Look up the vault's owner — that's who receives the alert and who
    // gets to approve.
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT owner FROM vaults WHERE pubkey = $1",
    )
    .bind(vault_pubkey)
    .fetch_optional(pool)
    .await?;
    let Some((owner,)) = row else {
        return Ok(());
    };

    let pending_spend_pubkey = ev.decoded.payload["pending_spend"].as_str();
    let nonce = ev.decoded.payload["nonce"].as_i64();

    // Insert the pending row. If the agent races us by also calling the
    // HTTP endpoint we could end up with two rows — the `(owner, alert_id)`
    // back-reference keeps them disambiguated and approve/reject only
    // touches one. The on-chain pubkey is unique per request and lets the
    // SpendRejected/Spent webhooks flip the right row later.
    let insert: sqlx::Result<(i64,)> = sqlx::query_as(
        "INSERT INTO pending_spends \
            (owner, agent, vault, service, amount_usdc, reason, \
             pending_spend_pubkey, nonce) \
         VALUES ($1, $2, $3, $4, $5, 'per_tx_exceeded', $6, $7) \
         ON CONFLICT (pending_spend_pubkey) DO UPDATE \
         SET owner = EXCLUDED.owner \
         RETURNING id",
    )
    .bind(&owner)
    .bind(agent_pubkey)
    .bind(vault_pubkey)
    .bind(service_pubkey)
    .bind(amount)
    .bind(pending_spend_pubkey)
    .bind(nonce)
    .fetch_one(pool)
    .await;
    let pending_id = insert?.0;

    let usdc = amount as f64 / 1_000_000.0;
    let alert_id = emit(
        pool,
        notifier,
        hub,
        Alert {
            owner: owner.clone(),
            kind: AlertKind::ApprovalRequired,
            severity: AlertSeverity::Urgent,
            title: format!("Approval required · {usdc:.2} USDC spend"),
            body: format!(
                "{} requested {usdc:.2} USDC to {} — above the vault's policy.",
                short(agent_pubkey),
                short(service_pubkey)
            ),
            data: json!({
                "pending_spend_id": pending_id,
                "pending_spend_pubkey": ev.decoded.payload["pending_spend"],
                "agent": agent_pubkey,
                "vault": vault_pubkey,
                "service": service_pubkey,
                "amount_usdc_lamports": amount,
                "amount_usdc": usdc,
                "nonce": ev.decoded.payload["nonce"],
                "slot": ev.slot,
            }),
        },
    )
    .await?;

    if let Err(err) = sqlx::query(
        "UPDATE pending_spends SET alert_id = $1 WHERE id = $2",
    )
    .bind(alert_id)
    .bind(pending_id)
    .execute(pool)
    .await
    {
        tracing::warn!(error = %err, pending_spend = pending_id, "alert backref failed");
    }

    Ok(())
}

/// Driven by the on-chain `Spent` event. Approve_spend CPI-transfers and
/// emits `Spent`; direct `spend` also emits `Spent`. We can't distinguish
/// the two from the event payload alone, so we look for a matching pending
/// row (FIFO by created_at) and flip it. If none matches, this was a
/// direct spend — no action.
async fn spend_approved_mirror(
    pool: &PgPool,
    notifier: &dyn Notifier,
    hub: &WsHub,
    ev: &ParsedEvent,
) -> sqlx::Result<()> {
    let Some(vault_pubkey) = ev.decoded.payload["vault"].as_str() else {
        return Ok(());
    };
    let Some(service_pubkey) = ev.decoded.payload["service"].as_str() else {
        return Ok(());
    };
    let Some(amount) = ev.decoded.payload["amount_usdc"].as_i64() else {
        return Ok(());
    };

    // Single-row UPDATE on the OLDEST matching pending. Approve order on
    // chain is owner-driven and almost always FIFO; if the owner ever
    // approves out of order we'll still flip a pending row of identical
    // shape, and the user sees the same end state. SELECT-then-UPDATE in
    // one statement avoids the read-modify-write race against a concurrent
    // HTTP `/decide` call.
    type ApprovedRow = (i64, String, Option<i64>, Option<String>, Option<i64>);
    let row: Option<ApprovedRow> = sqlx::query_as(
        "UPDATE pending_spends SET status = 'approved', decided_at = now() \
         WHERE id = ( \
             SELECT id FROM pending_spends \
             WHERE vault = $1 AND service = $2 AND amount_usdc = $3 \
               AND status = 'pending' \
             ORDER BY created_at ASC LIMIT 1 \
         ) \
         RETURNING id, owner, alert_id, pending_spend_pubkey, nonce",
    )
    .bind(vault_pubkey)
    .bind(service_pubkey)
    .bind(amount)
    .fetch_optional(pool)
    .await?;

    let Some((pending_id, owner, alert_id, pubkey, nonce)) = row else {
        return Ok(());
    };

    if let Some(alert_id) = alert_id {
        // Clear the bell badge for the request alert.
        let _ = sqlx::query(
            "UPDATE alerts SET read_at = now() \
             WHERE id = $1 AND owner = $2 AND read_at IS NULL",
        )
        .bind(alert_id)
        .bind(&owner)
        .execute(pool)
        .await;
    }

    let usdc = amount as f64 / 1_000_000.0;
    emit(
        pool,
        notifier,
        hub,
        Alert {
            owner,
            kind: AlertKind::ApprovalApproved,
            severity: AlertSeverity::Info,
            title: format!("Spend approved · {usdc:.2} USDC"),
            body: format!(
                "Released {usdc:.2} USDC to {} on chain.",
                short(service_pubkey)
            ),
            data: json!({
                "pending_spend_id": pending_id,
                "pending_spend_pubkey": pubkey,
                "vault": vault_pubkey,
                "service": service_pubkey,
                "amount_usdc_lamports": amount,
                "amount_usdc": usdc,
                "nonce": nonce,
                "slot": ev.slot,
            }),
        },
    )
    .await?;
    Ok(())
}

/// Driven by the on-chain `SpendRejected` event from cancel_spend. The
/// payload carries the pending_spend pubkey, which we use to find the
/// exact row.
async fn spend_rejected_mirror(
    pool: &PgPool,
    notifier: &dyn Notifier,
    hub: &WsHub,
    ev: &ParsedEvent,
) -> sqlx::Result<()> {
    let Some(pending_pubkey) = ev.decoded.payload["pending_spend"].as_str() else {
        return Ok(());
    };

    type RejectedRow =
        (i64, String, String, String, i64, Option<i64>, Option<i64>);
    let row: Option<RejectedRow> = sqlx::query_as(
        "UPDATE pending_spends SET status = 'rejected', decided_at = now() \
         WHERE pending_spend_pubkey = $1 AND status = 'pending' \
         RETURNING id, owner, vault, service, amount_usdc, nonce, alert_id",
    )
    .bind(pending_pubkey)
    .fetch_optional(pool)
    .await?;

    let Some((pending_id, owner, vault_pubkey, service_pubkey, amount, nonce, alert_id)) =
        row
    else {
        return Ok(());
    };

    if let Some(alert_id) = alert_id {
        let _ = sqlx::query(
            "UPDATE alerts SET read_at = now() \
             WHERE id = $1 AND owner = $2 AND read_at IS NULL",
        )
        .bind(alert_id)
        .bind(&owner)
        .execute(pool)
        .await;
    }

    let usdc = amount as f64 / 1_000_000.0;
    emit(
        pool,
        notifier,
        hub,
        Alert {
            owner,
            kind: AlertKind::ApprovalRejected,
            severity: AlertSeverity::Info,
            title: format!("Spend rejected · {usdc:.2} USDC"),
            body: format!(
                "Cancelled {usdc:.2} USDC request to {}.",
                short(&service_pubkey)
            ),
            data: json!({
                "pending_spend_id": pending_id,
                "pending_spend_pubkey": pending_pubkey,
                "vault": vault_pubkey,
                "service": service_pubkey,
                "amount_usdc_lamports": amount,
                "amount_usdc": usdc,
                "nonce": nonce,
                "slot": ev.slot,
            }),
        },
    )
    .await?;
    Ok(())
}

async fn freeze_alert(
    pool: &PgPool,
    notifier: &dyn Notifier,
    hub: &WsHub,
    ev: &ParsedEvent,
) -> sqlx::Result<()> {
    let Some(vault_pubkey) = ev.decoded.payload["vault"].as_str() else {
        return Ok(());
    };
    let Some(owner) = ev.decoded.payload["owner"].as_str() else {
        return Ok(());
    };
    emit(
        pool,
        notifier,
        hub,
        Alert {
            owner: owner.to_string(),
            kind: AlertKind::VaultFrozen,
            severity: AlertSeverity::Urgent,
            title: "Vault frozen".to_string(),
            body: format!(
                "Vault {} has stopped accepting payments. Unfreeze from the console to resume.",
                short(vault_pubkey)
            ),
            data: json!({
                "vault": vault_pubkey,
                "slot": ev.slot,
            }),
        },
    )
    .await?;
    Ok(())
}

fn short(pk: &str) -> String {
    if pk.len() <= 8 {
        pk.to_string()
    } else {
        format!("{}…{}", &pk[..4], &pk[pk.len() - 4..])
    }
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

    #[test]
    fn short_truncates_long_pubkey() {
        assert_eq!(
            short("AxMZj6QvN5VxRTpzdBcEwFHvuJxV3TA64"),
            "AxMZ…TA64"
        );
    }

    #[test]
    fn short_returns_short_pubkey_intact() {
        assert_eq!(short("abc"), "abc");
        assert_eq!(short("12345678"), "12345678");
    }
}
