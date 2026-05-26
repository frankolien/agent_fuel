use redis::{aio::ConnectionManager, AsyncCommands};
use sqlx::PgPool;

use crate::parser::ParsedEvent;

const CACHE_TTL_SECS: u64 = 300; // 5 minutes, matches the slice spec.

/// Optional Redis-backed cache. `None` means dev hasn't wired Redis;
/// reads transparently fall back to Postgres.
#[derive(Clone, Default)]
pub struct ScoreCache {
    redis: Option<ConnectionManager>,
}

impl ScoreCache {
    pub async fn connect(url: Option<&str>) -> Self {
        let Some(url) = url else {
            return Self::default();
        };
        match redis::Client::open(url) {
            Ok(client) => match ConnectionManager::new(client).await {
                Ok(conn) => Self { redis: Some(conn) },
                Err(err) => {
                    tracing::warn!(error = %err, "redis connect failed; running without cache");
                    Self::default()
                }
            },
            Err(err) => {
                tracing::warn!(error = %err, "redis URL invalid; running without cache");
                Self::default()
            }
        }
    }

    pub fn is_enabled(&self) -> bool {
        self.redis.is_some()
    }

    async fn set(&self, agent: &str, score: i32) {
        let Some(mut conn) = self.redis.clone() else {
            return;
        };
        let key = cache_key(agent);
        if let Err(err) = conn.set_ex::<_, _, ()>(&key, score, CACHE_TTL_SECS).await {
            tracing::warn!(error = %err, agent, "redis SET failed");
        }
    }

    pub async fn get(&self, agent: &str) -> Option<i32> {
        let mut conn = self.redis.clone()?;
        match conn.get::<_, Option<i32>>(cache_key(agent)).await {
            Ok(v) => v,
            Err(err) => {
                tracing::warn!(error = %err, agent, "redis GET failed");
                None
            }
        }
    }
}

fn cache_key(agent: &str) -> String {
    format!("score:{agent}")
}

/// Append `ScoreComputed` rows to `score_history` and warm the cache.
/// Idempotent on `(agent, slot)` so a webhook replay no-ops.
pub async fn record_events(pool: &PgPool, cache: &ScoreCache, events: &[ParsedEvent]) {
    for ev in events {
        if ev.decoded.event_name != "ScoreComputed" {
            continue;
        }
        let Some(agent) = ev.decoded.payload["agent"].as_str() else {
            continue;
        };
        let Some(score) = ev.decoded.payload["score"].as_i64().map(|v| v as i32) else {
            continue;
        };
        let Some(slot) = ev.decoded.payload["slot"].as_i64() else {
            continue;
        };

        let insert = sqlx::query(
            r#"
            INSERT INTO score_history (agent, score, slot)
            VALUES ($1, $2, $3)
            ON CONFLICT (agent, slot) DO NOTHING
            "#,
        )
        .bind(agent)
        .bind(score)
        .bind(slot)
        .execute(pool)
        .await;
        match insert {
            // Only warm the cache when this row is the new latest. Replays of
            // older scores otherwise clobber the cache with stale values.
            Ok(r) if r.rows_affected() > 0 => {
                if let Ok(Some(latest)) = latest_score(pool, agent).await {
                    cache.set(agent, latest).await;
                }
            }
            Ok(_) => {} // ON CONFLICT DO NOTHING — replay, leave the cache alone.
            Err(err) => tracing::warn!(error = %err, agent, slot, "score_history insert failed"),
        }
    }
}

/// Latest score: cache → DB. Returns `None` if the agent has no
/// ScoreComputed history yet.
pub async fn latest(pool: &PgPool, cache: &ScoreCache, agent: &str) -> sqlx::Result<Option<i32>> {
    if let Some(hit) = cache.get(agent).await {
        return Ok(Some(hit));
    }
    let score = latest_score(pool, agent).await?;
    if let Some(s) = score {
        cache.set(agent, s).await;
    }
    Ok(score)
}

async fn latest_score(pool: &PgPool, agent: &str) -> sqlx::Result<Option<i32>> {
    sqlx::query_scalar::<_, i32>(
        "SELECT score FROM score_history WHERE agent = $1 ORDER BY slot DESC LIMIT 1",
    )
    .bind(agent)
    .fetch_optional(pool)
    .await
}

/// Background sweep: refresh the cache for every agent with score history.
/// Called every 5 minutes. Cheap because the cache holds at most one entry
/// per agent and the table is keyed on `(agent, slot DESC)`.
pub async fn sweep(pool: &PgPool, cache: &ScoreCache) -> sqlx::Result<usize> {
    if !cache.is_enabled() {
        return Ok(0);
    }
    let rows: Vec<(String, i32)> = sqlx::query_as(
        r#"
        SELECT DISTINCT ON (agent) agent, score
        FROM score_history
        ORDER BY agent, slot DESC
        "#,
    )
    .fetch_all(pool)
    .await?;
    for (agent, score) in &rows {
        cache.set(agent, *score).await;
    }
    Ok(rows.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn cache_without_redis_returns_none() {
        let cache = ScoreCache::default();
        assert!(!cache.is_enabled());
        assert_eq!(cache.get("anything").await, None);
        cache.set("anything", 500).await; // no-op
    }

    #[test]
    fn cache_key_namespaces_under_score() {
        assert_eq!(cache_key("ABC"), "score:ABC");
    }
}
