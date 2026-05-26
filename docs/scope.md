# What We're Building (one page)

> A distillation of the PRD so we don't have to reread 23 pages to remember the shape.

## The product in one sentence

**The credit and policy layer for x402 agents on Solana.** An owner funds an on-chain vault, sets per-tx / per-hour / lifetime spending limits, and lets their agent spend within those bounds. A reputation primitive — fed by payment history and [ERC-8004](decisions/0003-erc-8004-compatibility.md)-compatible feedback from services — feeds into credit decisions: trusted agents unlock post-pay (deferred settlement).

## Three problems we solve

1. **No spending controls.** Funding an agent wallet means handing it the whole wallet. A bug drains it. → Credit Vault enforces per-tx, per-hour, and lifetime spending limits on-chain. *(The core moat — nobody else in the ecosystem has this.)*
2. **No deferred settlement.** Every x402 call is a separate on-chain tx. → Post-pay claims let trusted agents accumulate a tab and settle in batches.
3. **No payment-quality feedback tied to credit.** Services can't signal which agents are reliable in a way that affects credit access. → ERC-8004-compatible feedback primitive (symmetric: services file, agents respond, services can revoke) feeds the reputation score that gates post-pay.

## The two on-chain programs

| Program | PDAs | What it does |
| --- | --- | --- |
| **Reputation** | `AgentProfile`, `ServiceRegistry` | Tracks tx count, volume, streaks, disputes, services touched. Computes a 0–1000 reputation score. |
| **Credit Vault** | `CreditVault`, `SpendPolicy` (+ PDA-owned USDC ATA) | Holds USDC. Enforces policy on every spend. Supports post-pay claims, freeze, withdraw. |

## The off-chain layer

A single Rust/Actix-Web binary. Three jobs: ingest Helius webhooks for both programs, compute reputation scores, serve REST + WebSocket to clients. Postgres for history, Redis for hot reads, FCM for push.

> The PRD specifies Axum. We use Actix-Web instead — see [ADR-0002](decisions/0002-actix-web-over-axum.md).

## The clients

- **React dashboard** — fleet overview, agent detail, vault policy editor, analytics. Wallet Adapter for signing.
- **Flutter mobile app** — same core features, optimised for mobile + push notifications. Mobile Wallet Adapter for signing.
- **TypeScript SDK** — what agent developers import to make their agents use Agent Fuel instead of raw x402.

## The x402 integration

When an agent hits a `402 Payment Required`, the SDK calls `agentFuel.spend(service, amount)` instead of paying directly. The spend goes through the vault's policy gates, then CPIs USDC to the service. The agent retries the request with the tx signature.

For agents with score ≥ 800, services can skip upfront payment and submit a `claim` later. The backend batches claims and settles every 15 min.

## What "done" looks like (PRD success metrics, 6-month targets)

- 5,000 agent profiles on-chain
- 2,000 vaults, $5M in vault TVL
- 1M spends through vaults
- 5,000 weekly SDK downloads, 5 framework integrations
- 100 registered services

## What we are *not* building (anti-scope)

- Custodial wallets. Backend never holds keys.
- A token. No AFUEL or similar. Fees, if any, come later.
- A bridge. Single-chain (Solana) at launch. Cross-chain reputation is a Phase 6+ open question.
- ZK reputation proofs. Listed as a Phase 6 idea, not in v1.
- Score decay. Not in v1.
- **An ERC-8004 Identity Registry.** We're discoverable *as* ERC-8004 agents (per [ADR-0003](decisions/0003-erc-8004-compatibility.md)); we don't run the registry. SATI fills that role.
- **An ERC-8004 Validation Registry.** Out of scope. Third-party validators can build on top.
- **A general-purpose feedback marketplace.** Our `FeedbackRecord` exists to feed credit decisions, not to be a standalone reputation product competing with SATI / SAID.
- **Stake-and-challenge dispute arbitration.** [ADR-0004](decisions/0004-dispute-and-feedback-model.md) gives us symmetric feedback + revocation; full arbitration is a v2 RFC.

## The five phases (PRD §13)

| Phase | Weeks | Deliverable |
| --- | --- | --- |
| 1. Foundation | 1–4 | Reputation program on Devnet |
| 2. Credit Vault | 5–8 | Vault program with full policy enforcement on Devnet |
| 3. Backend | 9–12 | Actix-Web service indexing both programs, REST + WS live |
| 4. Clients | 13–16 | React dashboard, Flutter app, npm SDK published |
| 5. Launch | 17–20 | Audit, Mainnet-beta, partner beta, public launch |
