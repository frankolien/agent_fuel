//! One-shot migration: rewrite legacy PaymentRecorded / ScoreComputed events
//! whose `payload.agent` was emitted as the AgentProfile PDA instead of the
//! authority pubkey. The on-chain program was patched so new events carry the
//! authority directly; this binary translates the historic backlog so the
//! agents mirror picks up accumulated stats during the post-run refresh.
//!
//! Usage:  cargo run -p agent_fuel_backend --bin migrate_event_agent_keys
//!
//! Reads `DATABASE_URL` from the environment. Idempotent — runs that have
//! already been translated remain `payload.agent == authority` and are
//! filtered out by the WHERE clause.

use std::collections::HashSet;

use agent_fuel_backend::{backfill::agent_profile_pda, mirror};
use sqlx::PgPool;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    let database_url = std::env::var("DATABASE_URL")
        .map_err(|_| anyhow::anyhow!("DATABASE_URL is not set"))?;
    let pool = PgPool::connect(&database_url).await?;

    let authorities: Vec<(String,)> = sqlx::query_as("SELECT pubkey FROM agents")
        .fetch_all(&pool)
        .await?;
    if authorities.is_empty() {
        println!("no agents found — nothing to migrate");
        return Ok(());
    }

    let mut touched = HashSet::<String>::new();
    let mut total_updated: u64 = 0;
    for (authority,) in &authorities {
        let Some(pda) = agent_profile_pda(authority) else {
            eprintln!("warn: could not derive PDA for {authority}; skipping");
            continue;
        };
        // Rewrite payload.agent from PDA → authority for the two event types
        // that carried the wrong value. jsonb_set is no-op when key doesn't
        // exist, so the WHERE filter is the real guard against double-runs.
        let result = sqlx::query(
            r#"
            UPDATE events
            SET payload = jsonb_set(payload, '{agent}', to_jsonb($2::text), false)
            WHERE event_name IN ('PaymentRecorded', 'ScoreComputed')
              AND payload->>'agent' = $1
            "#,
        )
        .bind(&pda)
        .bind(authority)
        .execute(&pool)
        .await?;
        if result.rows_affected() > 0 {
            println!(
                "  rewrote {} event(s) for {} (pda={})",
                result.rows_affected(),
                authority,
                pda
            );
            touched.insert(authority.clone());
            total_updated += result.rows_affected();
        }
    }

    if touched.is_empty() {
        println!("nothing to migrate — all events already use authority pubkeys");
        return Ok(());
    }

    println!(
        "translated {total_updated} event(s) across {} agent(s); refreshing mirror…",
        touched.len()
    );
    let affected = mirror::Affected {
        agents: touched,
        services: HashSet::new(),
        vaults: HashSet::new(),
    };
    mirror::refresh(&pool, &affected).await?;
    println!("done — agent rows rebuilt from the corrected event payloads");
    Ok(())
}
