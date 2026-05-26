# Phases & Slices

> The PRD has 5 phases. Each phase is a stack of feature slices.
> A slice is the unit of work defined in [`algorithm.md`](algorithm.md).

## Phase 1 — Foundation (PRD weeks 1–4; revised to weeks 1–5 per [ADR-0004](decisions/0004-dispute-and-feedback-model.md))

**Phase exit criteria:** Reputation program deployed to Devnet with all seven instructions working, full test coverage, ERC-8004 discoverability metadata exposed, `data-model.md` filled in for the program.

### Slices

1. **Workspace scaffold.** Anchor workspace, two empty program crates, CI runs `anchor build` + `anchor test`.
2. **`AgentProfile` + `initialize_agent`.** An owner creates a profile PDA for an agent wallet. Includes `agent_uri: [u8; 128]` + `external_agent_id: u64` per [ADR-0003](decisions/0003-erc-8004-compatibility.md). SDK gains a `generateRegistrationFile()` helper that produces an ERC-8004-shaped JSON for the URI.
3. **`ServiceRegistry` + `register_service`.** A service wallet registers itself with a name + category.
4. **`record_payment`.** Backend-signed instruction increments tx count, volume, streak, `services_used` on `AgentProfile`. Emits `PaymentRecorded`.
5a. **`FeedbackRecord` PDA + `give_feedback`.** Service-signed feedback with `value` (signed), tags, payment signature, evidence URI/hash. Enforces ERC-8004 anti-self-rating constraint on-chain (`service != agent.owner && service != agent.authority`).
5b. **`append_response`.** Agent-or-owner-signed; attaches the agent's response URI/hash to a specific `FeedbackRecord`.
5c. **`revoke_feedback`.** Original-service-signed; flips `revoked = true`. Revoked entries excluded from score.
5d. **Rate-limit enforcement.** At most 1 feedback per `(service, agent)` per ~216,000 slots (24h). Field placement (per-profile vs side-PDA) decided in `data-model.md` during the slice.
6. **`compute_score`.** Permissionless instruction reads `total_transactions`, `total_volume_usdc`, `consecutive_success`, `services_used`, `total_feedback_count`, `active_negative_feedback_count`, `first_active_slot`, `last_active_slot`. Applies the PRD §10.1 formula (with the dispute factor reframed in terms of active negative feedback). Writes `reputation_score`.

## Phase 2 — Credit Vault (PRD weeks 5–8)

**Phase exit criteria:** Credit Vault program deployed to Devnet. An owner can fund a vault, set a policy, and the agent can spend within bounds. All four constraint checks tested. Freeze + withdraw work. Post-pay `claim` works.

### Slices

1. **`CreditVault` + `SpendPolicy` PDAs + `create_vault`.** PDA-owned USDC ATA initialised.
2. **`deposit`.** Owner moves USDC into the vault token account.
3. **`spend` — happy path only.** No policy checks yet; just CPI the USDC transfer. Proves PDA-signed CPIs work.
4. **`spend` — frozen check.**
5. **`spend` — whitelist check.**
6. **`spend` — per-tx limit.**
7. **`spend` — hourly rolling window.**
8. **`spend` — lifetime ceiling.**
9. **`freeze_vault` / `unfreeze_vault`.**
10. **`update_policy`.**
11. **`withdraw`.**
12. **`claim` (post-pay).** Service-signed; checks `allow_post_pay`, replays policy bounds.

## Phase 3 — Backend (PRD weeks 9–12)

**Phase exit criteria:** Actix-Web service ingests Helius webhooks for both programs, mirrors all state into Postgres, serves the REST + WS endpoints in PRD §7.3, fires FCM alerts on budget thresholds.

### Slices

1. **Actix-Web + SQLx + Postgres migrations skeleton.** Health check endpoint.
2. **Helius webhook receiver.** Verifies shared-secret signature, logs payloads.
3. **Event parser.** For each event in `data-model.md`, decode and write a row to `events`.
4. **Mirror tables.** `agents`, `vaults`, `services` tables stay current via event handlers.
5. **Score engine.** Background 5-min sweep + on-demand recompute. Redis cache (5-min TTL). `score_history` writes.
6. **SIWS auth.** Sign-in-with-Solana flow, 1-hour tokens.
7. **Owner REST endpoints.** Agents, vaults, activity, score, score history.
8. **Service REST endpoint.** Permissionless, rate-limited reputation lookup.
9. **WebSocket stream.** `/ws/agents/:pubkey`, pushes events to subscribed clients.
10. **FCM device registration + alerts.** Push on 70/80/90% budget thresholds, score change, spend rejected.

## Phase 4 — Clients (PRD weeks 13–16)

**Phase exit criteria:** React dashboard deployed to Vercel preview, Flutter app runs on iOS + Android sim, TS SDK published as `@agentfuel/sdk` v0.1 to npm with a working README example.

### Slices

_To be broken down at the start of Phase 4 — depends on which Phase 3 surfaces shipped._

## Phase 5 — Launch (PRD weeks 17–20)

**Phase exit criteria:** Programs audited, deployed to Mainnet-beta, 3+ partner agents live, App Store + Google Play submissions in review, docs site live.

### Slices

_To be broken down closer to the date._

## Slice tracking

We track slice status with a simple list at the bottom of each phase as we go. No external tracker.

Status keys: `todo` · `spec'd` (data-model.md updated) · `building` · `tested` · `shipped`.
