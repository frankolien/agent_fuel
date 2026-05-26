# Agent Fuel backend

Actix-Web indexer + REST/WS API. Ingests Helius webhooks for the two Anchor
programs, mirrors on-chain state into Postgres, serves the REST and WebSocket
surfaces consumed by the dashboard, mobile app, and SDK, and pushes FCM alerts
on budget thresholds.

The phased build is tracked in [`docs/phases.md`](../docs/phases.md) — Phase 3.

## Layout

```
backend/
├── Cargo.toml
├── migrations/            sqlx-managed SQL, embedded into the binary
└── src/
    ├── main.rs            entrypoint + HTTP server
    ├── config.rs          env-driven Config
    ├── db.rs              Postgres pool + migration runner
    ├── state.rs           AppState injected via web::Data
    └── routes/
        ├── mod.rs         route registration
        └── health.rs      /health/live + /health/ready
```

> **For the full step-by-step walk** (including the docker/ngrok/Helius
> setup and the real gotchas we hit), see
> [`docs/backend-local-dev.md`](../docs/backend-local-dev.md). The section
> below is the condensed version.

## Running locally

Prereqs: Rust toolchain pinned by [`rust-toolchain.toml`](../rust-toolchain.toml),
Docker (or a reachable Postgres).

```bash
# 1. Start Postgres
docker run -d --name agent_fuel_pg \
  -e POSTGRES_USER=agent_fuel -e POSTGRES_PASSWORD=agent_fuel \
  -e POSTGRES_DB=agent_fuel -p 5432:5432 postgres:16

# 2. Configure env
cp .env.example .env

# 3. Run — migrations apply automatically on boot
cargo run -p agent_fuel_backend
```

Then:

```bash
curl http://127.0.0.1:8080/health/live   # liveness — process up
curl http://127.0.0.1:8080/health/ready  # readiness — Postgres reachable
```

## Health-check split

| Endpoint | Checks | Used by |
| --- | --- | --- |
| `/health/live` | Process answers HTTP | Container platform liveness probe |
| `/health/ready` | Postgres `SELECT 1` | Load-balancer readiness probe |

The split lets a DB blip drain traffic from an instance without triggering a
restart loop.

## Migrations

SQL files in `migrations/` are embedded via `sqlx::migrate!` and applied on
startup. Add a new file with a fresh timestamp prefix — never edit applied
migrations.
