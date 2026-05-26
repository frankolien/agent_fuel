use sqlx::{PgPool, Postgres, Transaction};

use crate::parser::ParsedEvent;

pub async fn insert_events(pool: &PgPool, events: &[ParsedEvent]) -> sqlx::Result<u64> {
    if events.is_empty() {
        return Ok(0);
    }
    let mut tx: Transaction<'_, Postgres> = pool.begin().await?;
    let mut inserted = 0u64;
    for ev in events {
        let result = sqlx::query(
            r#"
            INSERT INTO events (signature, log_index, slot, program_id, event_name, payload)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (signature, log_index) DO NOTHING
            "#,
        )
        .bind(&ev.signature)
        .bind(ev.log_index)
        .bind(ev.slot)
        .bind(&ev.program_id)
        .bind(ev.decoded.event_name)
        .bind(&ev.decoded.payload)
        .execute(&mut *tx)
        .await?;
        inserted += result.rows_affected();
    }
    tx.commit().await?;
    Ok(inserted)
}
