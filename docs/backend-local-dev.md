# Backend local-dev setup

> Goal: from a fresh terminal, get the Actix-Web backend booting, accepting
> live Helius webhooks for the devnet programs, and replying with `202`.
> This doc captures the actual setup walk (Slice 3.1 + 3.2) including the
> gotchas we hit, so you don't have to rediscover them.

## What you're building

```
                                  ┌─────────────────┐
   on-chain tx on devnet  ──▶     │ Helius webhook  │  HTTPS POST
   (reputation / vault)           │  (enhanced)     │ ─────────────┐
                                  └─────────────────┘              │
                                                                   ▼
                              ┌────────────────────────────────────────┐
                              │ ngrok tunnel                           │
                              │ https://*.ngrok-free.dev → :8080       │
                              └────────────────────────────────────────┘
                                                                   │
                                                                   ▼
                              ┌────────────────────────────────────────┐
                              │ Actix-Web backend (127.0.0.1:8080)     │
                              │ • verifies Authorization header        │
                              │ • logs payload (parser in Slice 3.3)   │
                              └────────────────────────────────────────┘
                                                                   │
                                                                   ▼
                              ┌────────────────────────────────────────┐
                              │ Postgres (docker container)            │
                              │ 127.0.0.1:5434 → agent_fuel DB         │
                              └────────────────────────────────────────┘
```

## One-time prereqs

| Tool | Install | Why |
| --- | --- | --- |
| Rust toolchain | pinned by [`rust-toolchain.toml`](../rust-toolchain.toml) | builds the backend |
| Docker Desktop | `brew install --cask docker` | runs Postgres + Redis |
| ngrok | `brew install ngrok` + `ngrok config add-authtoken <token>` (free signup) | exposes localhost to Helius |
| Solana CLI | `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"` | triggers test transactions |
| Helius account | free signup at helius.dev | sends the webhooks |

You only do these once per machine.

## Step 1 — Postgres in Docker

The backend opens a connection pool against `DATABASE_URL` and runs embedded
migrations on startup; without Postgres it won't even boot.

```bash
docker run -d --name agent_fuel_pg \
  -e POSTGRES_USER=agent_fuel \
  -e POSTGRES_PASSWORD=agent_fuel \
  -e POSTGRES_DB=agent_fuel \
  -p 5434:5432 postgres:16
```

**Why port 5434?** During the original setup we hit a stack of collisions
on the default port:

| Port | Listener | Notes |
| --- | --- | --- |
| 5432 | `xend-pg` container (other project) | left it alone |
| 5433 | Brew-installed `postgresql@17` on the host | left it alone |
| 5434 | _free_ | this is where ours lives |

If your machine doesn't have those collisions, plain `-p 5432:5432` is fine
— just keep `DATABASE_URL` in sync. The reason the issue is sneaky on macOS:
Docker binds to `*:<port>` (IPv6, all interfaces) while a host-native
postgres binds to the more-specific `127.0.0.1:<port>` (IPv4 loopback). The
kernel routes a `127.0.0.1` connection to the more-specific listener — so
the backend silently talks to the host postgres instead of our container
and gets `role "agent_fuel" does not exist`. Picking an unused port is the
clean fix.

**Verify the container has the role and database:**

```bash
docker exec agent_fuel_pg psql -U agent_fuel -d agent_fuel \
  -c "SELECT current_user, current_database();"
# → agent_fuel | agent_fuel
```

If that returns "role does not exist", the container's init script didn't
run on a fresh data dir (typically because a stale anonymous volume was
reused). Nuke and retry:

```bash
docker rm -f agent_fuel_pg
docker volume prune -f
# then re-run the docker run command
```

## Step 1b — Redis in Docker (slice 3.5+)

Optional in dev — without Redis the score endpoint hits Postgres on every
read, which is fine for low traffic. Recommended for parity with prod.

```bash
docker run -d --name agent_fuel_redis -p 6379:6379 redis:7-alpine
docker exec agent_fuel_redis redis-cli PING   # → PONG
```

## Step 2 — `.env`

The backend reads its config from environment variables; locally that comes
from `.env` at the repo root. See [`.env.example`](../.env.example) for the
canonical inventory. A working `.env` for Slice 3.2 looks like:

```env
BIND_ADDR=127.0.0.1:8080
RUST_LOG=info,agent_fuel_backend=debug

DATABASE_URL=postgres://agent_fuel:agent_fuel@127.0.0.1:5434/agent_fuel
DB_MAX_CONNECTIONS=10

HELIUS_WEBHOOK_SECRET=<32+ random hex chars — generate with `openssl rand -hex 32`>

REPUTATION_PROGRAM_ID=4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ
CREDIT_VAULT_PROGRAM_ID=EsykPsafhHUeN7jA9DGqBiGuBsTBaFynLDVVpE4jFXDg
```

**Why `127.0.0.1:5434`?** Matches the docker mapping in Step 1. Change in
lock-step if you used a different port.

**Why a 32-byte hex secret?** Helius accepts any string; we use a long
random one so a probing attacker can't brute-force it. The backend
constant-time-compares it via `subtle::ConstantTimeEq` so timing-side
channels can't leak it byte-by-byte either.

**`.env` is gitignored** — never commit it. `.env.example` is the
committed template.

## Step 3 — Boot the backend

```bash
# from the repo root (any subdirectory also works — the binary walks up
# to find .env, see backend/src/main.rs:load_dotenv)
cargo run -p agent_fuel_backend
```

Healthy log looks like:

```
INFO starting backend bind=127.0.0.1:8080 db=postgres://***@127.0.0.1:5434/agent_fuel
INFO ...sqlx migrations applied...
INFO starting 10 workers
INFO starting service: "actix-web-service-127.0.0.1:8080", workers: 10
```

If the `db=` line doesn't show your expected URL, `.env` isn't being
loaded — see [Gotchas](#gotchas) below.

**Smoke-test from a second terminal:**

```bash
curl http://127.0.0.1:8080/health/live    # → {"status":"ok"}  (process up)
curl http://127.0.0.1:8080/health/ready   # → {"status":"ok"}  (Postgres reachable)
```

Both `200` means the backend is wired correctly. Move on.

## Step 4 — ngrok tunnel

Helius needs an HTTPS URL it can POST to. Locally we expose `:8080` via
ngrok.

```bash
ngrok http 8080
```

ngrok prints a `Forwarding` line — copy the `https://*.ngrok-free.dev`
URL. That's your webhook URL. The inspector at
[`http://127.0.0.1:4040`](http://127.0.0.1:4040) is invaluable: it shows
every inbound request body, so you can see exactly what Helius sent even
if your handler doesn't log it.

**Free-tier gotcha:** the URL changes every time you restart ngrok. You'll
need to update the Helius webhook URL each time. A free static domain is
available on signed-in accounts via `ngrok http 8080 --domain=<your-static>.ngrok.app`.

## Step 5 — Configure the Helius webhook

In the Helius dashboard → Webhooks → **New Webhook**:

| Field | Value |
| --- | --- |
| Network | **devnet** |
| Webhook Type | **enhanced** (parsed accounts + instructions; "raw" is fine if you prefer hand-decoding) |
| Transaction Type(s) | **Any** — our custom Anchor instructions don't match Helius's NFT/DeFi taxonomy, so any specific filter would silently drop nearly all of our traffic |
| Webhook URL | `<your-ngrok-url>/webhooks/helius` |
| Authentication Header | the exact value of `HELIUS_WEBHOOK_SECRET` from `.env` (just the value, no `Bearer ` prefix) |
| Account Addresses | both program IDs: `4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ` and `EsykPsafhHUeN7jA9DGqBiGuBsTBaFynLDVVpE4jFXDg` |

Confirm. Webhook status should flip to **Active**.

## Step 6 — End-to-end verification

Send a no-op transaction that references one of the programs:

```bash
solana config set --url https://api.devnet.solana.com
solana transfer 4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ 0.0001 \
  --allow-unfunded-recipient
```

Watch three places:

1. **Backend terminal** — within ~30 s should log
   `accepted Helius webhook payload (parser arrives in slice 3.3) bytes=<N>`
2. **ngrok inspector** (`http://127.0.0.1:4040`) — shows the raw POST,
   confirming `User-Agent: Helius-Webhook-Service/1.0`
3. **Helius dashboard → your webhook → Deliveries** — shows `202`

If all three line up, Slice 3.2 is verified live.

## Smoke-testing without devnet traffic

Useful when iterating on the handler:

```bash
# Wrong secret → 401
curl -i -X POST https://<your-ngrok>.ngrok-free.dev/webhooks/helius \
  -H "Authorization: bogus" -d '{}'

# Right secret → 202
curl -i -X POST https://<your-ngrok>.ngrok-free.dev/webhooks/helius \
  -H "Authorization: <secret-from-env>" \
  -d '{}'

# No header → 401
curl -i -X POST https://<your-ngrok>.ngrok-free.dev/webhooks/helius -d '{}'
```

Same three checks against `127.0.0.1:8080` directly work for verifying the
local backend without the ngrok detour.

## Gotchas

A summary of the actual issues we hit so they're easier to recognise next
time.

### `Bind for 0.0.0.0:5432 failed: port is already allocated`
Another Postgres is already on 5432. Use a different host port in the
`docker run -p HOST:5432` flag. See Step 1.

### `Conflict. The container name "/agent_fuel_pg" is already in use`
A previous `docker run` created the container record before failing on
networking. Clean up: `docker rm -f agent_fuel_pg`, then retry.

### `role "agent_fuel" does not exist` (even though `docker exec` shows the role)
The backend is connecting to a *different* Postgres than the one you
verified. Most likely a host-native Postgres on the same port. Run
`lsof -nP -iTCP:<port> -sTCP:LISTEN`; if you see a non-Docker listener,
move our container to an unused port and update `DATABASE_URL`. See Step 1.

### Backend boots but `db=...` line shows the wrong host/port
`.env` isn't being loaded from where you think. The binary tries
`../.env` (works when run via `cargo run -p agent_fuel_backend` from the
package dir) and falls back to `dotenvy::dotenv()`'s
current-directory-and-up search. Easiest fix: `cd` to the repo root and
re-run.

### `Address already in use (os error 48)` on `cargo run`
Another `agent_fuel_backend` is still running on 8080.
`lsof -ti :8080 | xargs kill` then retry.

### ngrok URL keeps changing
Free tier behaviour. Use `ngrok http 8080 --domain=<your-static>.ngrok.app`
(available free with a signed-in account) for a stable domain.

### Helius webhook fires but backend returns 401
The `Authorization` header value in Helius doesn't match
`HELIUS_WEBHOOK_SECRET` in `.env`. Re-paste the secret in the dashboard;
make sure there's no trailing whitespace and no `Bearer ` prefix.

### Helius webhook fires but backend returns 503
`HELIUS_WEBHOOK_SECRET` is unset or empty in the environment. Set it in
`.env`, restart the backend.

## Tearing it all down

```bash
# Stop the backend: Ctrl-C in its terminal, or
lsof -ti :8080 | xargs kill

# Stop ngrok: Ctrl-C

# Stop Postgres / Redis (keeps data)
docker stop agent_fuel_pg agent_fuel_redis

# Fully wipe
docker rm -f agent_fuel_pg agent_fuel_redis
```

Restarting later: `docker start agent_fuel_pg agent_fuel_redis` (data
persists), then `cargo run -p agent_fuel_backend`, then `ngrok http 8080`,
then update the Helius webhook URL.
