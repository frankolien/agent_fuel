// Postgres connection pool + migration runner.
//
// Migrations live under `backend/migrations/` and are embedded into the binary
// via the `sqlx::migrate!` macro, so a deployed image carries its schema with
// it — no separate `sqlx migrate run` step on prod.

use sqlx::postgres::{PgPool, PgPoolOptions};
use std::time::Duration;

pub async fn connect(database_url: &str, max_connections: u32) -> anyhow::Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(max_connections)
        .acquire_timeout(Duration::from_secs(5))
        .connect(database_url)
        .await?;
    Ok(pool)
}

pub async fn run_migrations(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::migrate!("./migrations").run(pool).await?;
    Ok(())
}
