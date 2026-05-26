# Data Model

> The canonical spec of every PDA, instruction, error, and event in Agent Fuel.
> **Updated before code is written. Never the other way around.**

## How to read this file

For each on-chain capability we ship, this file gets a new entry with four sections:

1. **PDA(s)** — name, seeds, fields, sizes.
2. **Instruction(s)** — name, signers, accounts, args, effect.
3. **Errors** — every failure mode, with a stable code.
4. **Events** — what is emitted on success.

The entries are grouped by program. Within a program, in the order we built them — so the file doubles as a changelog.

---

## Reputation Program

_Program ID: TBD (Devnet) / TBD (Mainnet)_

### Design constraints (from accepted ADRs)

Any PDA or instruction added here must honour these. If a slice forces a violation, write a superseding ADR first.

- **[ADR-0003](decisions/0003-erc-8004-compatibility.md) — ERC-8004 discoverability.**
  - `AgentProfile` MUST carry `agent_uri: [u8; 128]` and `external_agent_id: u64` (default 0).
  - The program ID is the Solana ERC-8004 namespace anchor: `solana:{cluster}:{program_id}`. Documented in SDK; no on-chain enforcement.
  - We do NOT implement an ERC-8004 Identity Registry, Reputation Registry interface, or Validation Registry — discoverability only.
- **[ADR-0004](decisions/0004-dispute-and-feedback-model.md) — symmetric feedback model.**
  - The PRD's `dispute_count: u32` on `AgentProfile` is replaced by aggregated `total_feedback_count: u32` and `active_negative_feedback_count: u32`. A per-feedback `FeedbackRecord` PDA holds the detail.
  - Three instructions cover what the PRD's `record_dispute` covered: `give_feedback`, `append_response`, `revoke_feedback`.
  - On-chain anti-self-rating: `give_feedback` rejects if signer equals `agent_profile.owner` or `agent_profile.authority`.
  - Rate limit: 1 feedback per `(service, agent)` per ~216,000 slots (24h). Implementation field placement chosen during Slice 5d.
  - The score engine treats positive `value` as currently informational only (no score uplift in v1).

### PDAs

#### `AgentProfile` *(slice 2)*

The on-chain identity of an agent. One per agent wallet. Carries the behavioural counters that feed `compute_score`, plus the ERC-8004 discoverability fields.

| Property | Value |
| --- | --- |
| Seeds | `[b"agent", agent_wallet.key().as_ref()]` |
| Total account size | **321 bytes** (8 discriminator + 313 data) |
| Lifetime | Created by `initialize_agent`. Never closed in v1. |

| Field | Type | Bytes | Notes |
| --- | --- | --- | --- |
| `authority` | `Pubkey` | 32 | Agent wallet pubkey. Matches the seed. Will sign `spend` on the Credit Vault program in Phase 2; never signs anything on this program after init. |
| `owner` | `Pubkey` | 32 | Human owner. Authorized to call `append_response` and any future management instructions. |
| `agent_uri` | `[u8; 128]` | 128 | ERC-8004 registration JSON URI (UTF-8, zero-padded). Per [ADR-0003](decisions/0003-erc-8004-compatibility.md). Empty (all-zero) is valid for agents that opt out. |
| `external_agent_id` | `u64` | 8 | EVM ERC-8004 agent ID for cross-chain identity. `0` = none. Per ADR-0003. |
| `total_transactions` | `u64` | 8 | Cumulative successful x402 payments. Incremented by `record_payment` (slice 4). |
| `total_volume_usdc` | `u64` | 8 | Cumulative USDC volume in lamports (USDC has 6 decimals). |
| `consecutive_success` | `u32` | 4 | Current streak. Reset on a new negative `FeedbackRecord`. |
| `total_feedback_count` | `u32` | 4 | All feedback received, including revoked. Per [ADR-0004](decisions/0004-dispute-and-feedback-model.md). |
| `active_negative_feedback_count` | `u32` | 4 | Feedback with `value < 0` and `revoked == false`. Feeds the score formula. Per ADR-0004. |
| `services_used` | `u16` | 2 | Unique services this agent has transacted with. |
| `first_active_slot` | `u64` | 8 | Slot of `initialize_agent`. |
| `last_active_slot` | `u64` | 8 | Slot of most recent meaningful update. |
| `reputation_score` | `u16` | 2 | Computed score, 0–1000 basis points. Written by `compute_score` (slice 6). |
| `bump` | `u8` | 1 | PDA bump (stored to skip re-derivation on every CPI). |
| `_padding` | `[u8; 64]` | 64 | Reserved for future fields (≥ 64 bytes per data-model conventions). |

**Initial values set by `initialize_agent`:**

- `authority = agent.key()`
- `owner = owner.key()`
- `agent_uri = <caller-supplied>`
- `external_agent_id = <caller-supplied>` (0 if none)
- `first_active_slot = last_active_slot = Clock::get()?.slot`
- everything else = `0` / zero-filled

#### `ServiceRegistry` *(slice 3)*

A service provider's on-chain registration. One per service wallet. Stores enough metadata for agents to discover services and for the indexer to aggregate per-service stats.

| Property | Value |
| --- | --- |
| Seeds | `[b"service", service_wallet.key().as_ref()]` |
| Total account size | **171 bytes** (8 discriminator + 163 data) |
| Lifetime | Created by `register_service`. `active` toggles soft-delete; never closed in v1. |

| Field | Type | Bytes | Notes |
| --- | --- | --- | --- |
| `authority` | `Pubkey` | 32 | Service wallet pubkey. Matches the PDA seed. Signs all service-side instructions. |
| `name` | `[u8; 32]` | 32 | Human-readable name, UTF-8 zero-padded. |
| `category` | `ServiceCategory` | 1 | Enum tag: `DataFeed`, `Compute`, `Swap`, `Rpc`, `Other`. |
| `total_agents_served` | `u64` | 8 | Unique agents that have paid this service. Incremented in slice 4 (`record_payment`). |
| `total_volume_received_usdc` | `u64` | 8 | Cumulative USDC received in lamports (6 decimals). |
| `active` | `bool` | 1 | `false` = soft-deleted; the service no longer advertises itself. |
| `first_active_slot` | `u64` | 8 | Slot of `register_service`. |
| `last_active_slot` | `u64` | 8 | Slot of most recent meaningful update. |
| `bump` | `u8` | 1 | PDA bump. |
| `_padding` | `[u8; 64]` | 64 | Reserved for future fields. |

```rust
pub enum ServiceCategory {
    DataFeed,
    Compute,
    Swap,
    Rpc,
    Other,
}
```

**Initial values set by `register_service`:**

- `authority = service.key()`
- `name = <caller-supplied>`
- `category = <caller-supplied>`
- `active = true`
- `first_active_slot = last_active_slot = Clock::get()?.slot`
- everything else = `0` / zero-filled

#### `AgentServiceLink` *(slice 4)*

Marker + per-pair counters for an `(agent, service)` transaction relationship. Created on the **first** `record_payment` between a given agent and service. Lets us increment `AgentProfile.services_used` and `ServiceRegistry.total_agents_served` exactly once per unique pair, and surfaces per-pair volume to the indexer.

| Property | Value |
| --- | --- |
| Seeds | `[b"link", agent_profile.key().as_ref(), service_registry.key().as_ref()]` |
| Total account size | **178 bytes** (8 discriminator + 170 data) |
| Lifetime | Created lazily on first payment via `init_if_needed`. Never closed in v1. |

| Field | Type | Bytes | Notes |
| --- | --- | --- | --- |
| `agent` | `Pubkey` | 32 | `agent_profile.key()`. Stored for indexer convenience; also the "is-new?" sentinel — `Pubkey::default()` means just-created. |
| `service` | `Pubkey` | 32 | `service_registry.key()`. |
| `total_transactions` | `u64` | 8 | Payments between this pair. |
| `total_volume_usdc` | `u64` | 8 | Cumulative volume between this pair (lamports). |
| `first_payment_slot` | `u64` | 8 | Slot of first `record_payment` for this pair. |
| `last_payment_slot` | `u64` | 8 | Slot of most recent payment. |
| `last_feedback_slot` | `u64` | 8 | Slot of the most recent `give_feedback` from this service about this agent. Meaningful only when `has_received_feedback == true`. |
| `has_received_feedback` | `bool` | 1 | `true` iff at least one feedback has been filed. Explicit flag (rather than a `last_feedback_slot == 0` sentinel) because real feedback can legitimately land at slot 0 at genesis or in test environments. |
| `bump` | `u8` | 1 | PDA bump. |
| `_padding` | `[u8; 64]` | 64 | Reserved. |

**Why `init_if_needed` instead of a separate `register_pair` instruction:** the link is a marker — it has no off-chain configuration, no human decision, no negotiation. Forcing callers to invoke two instructions for the first payment between a pair would just shift complexity onto the SDK. The init-if-needed footgun (a malicious caller passing a pre-existing account) doesn't apply here because (a) the link is PDA-derived (seeds are deterministic from the agent + service keys), and (b) every field we read post-init we *set* in the same branch.

#### `ReceiptUsed` *(slice 4)*

Single-use marker per x402 payment receipt hash. Created with `init` (not `init_if_needed`) inside `record_payment`, so a second call with the same hash fails with Anchor's `AccountAlreadyInUse` — that constraint failure **is** the replay defence. Receipt uniqueness is **global** across the program: the same hash cannot be used for two different `(agent, service)` pairs.

| Property | Value |
| --- | --- |
| Seeds | `[b"receipt", payment_receipt_hash.as_ref()]` |
| Total account size | **113 bytes** (8 discriminator + 105 data) |
| Lifetime | Created on first record. Never closed. Storage grows monotonically with payment count — the cost of a strong replay guarantee. |

| Field | Type | Bytes | Notes |
| --- | --- | --- | --- |
| `receipt_hash` | `[u8; 32]` | 32 | The hash this PDA represents. Stored for off-chain indexer lookup (the indexer can find this PDA by seed-derivation alone, but having the hash in the data is cheaper to scan). |
| `agent_service_link` | `Pubkey` | 32 | Address of the `AgentServiceLink` this receipt was recorded against. Lets indexers walk receipt → pair without a second derivation. |
| `recorded_slot` | `u64` | 8 | Slot at which the receipt was recorded. |
| `bump` | `u8` | 1 | PDA bump. |
| `_padding` | `[u8; 32]` | 32 | Reserved. |

#### `FeedbackRecord` *(slice 5a)*

A single feedback entry from a service about an agent, tied to the specific payment that triggered it. Per [ADR-0004](decisions/0004-dispute-and-feedback-model.md). Slice 5b populates the response fields; slice 5c flips `revoked`.

| Property | Value |
| --- | --- |
| Seeds | `[b"feedback", payment_receipt_hash.as_ref()]` |
| Total account size | **512 bytes** (8 discriminator + 504 data) |
| Lifetime | Created by `give_feedback`. Mutated by `append_response` (5b) and `revoke_feedback` (5c). Never closed. |

| Field | Type | Bytes | Notes |
| --- | --- | --- | --- |
| `agent_profile` | `Pubkey` | 32 | The agent being rated. |
| `service_registry` | `Pubkey` | 32 | The service giving the rating. |
| `payment_receipt_hash` | `[u8; 32]` | 32 | The payment this feedback is about. Also embedded in the seed; stored for indexer convenience. |
| `value` | `i8` | 1 | Rating in `[-100, 100]`. Negative values bump `active_negative_feedback_count` and reset `consecutive_success`. `0` is informational/neutral. |
| `tags` | `u32` | 4 | Bitmask of categorical tags. Tag meanings are defined off-chain — the chain only stores the bits. |
| `evidence_uri` | `[u8; 128]` | 128 | URI to off-chain evidence (e.g., `ipfs://…`). Zero-padded UTF-8. |
| `evidence_hash` | `[u8; 32]` | 32 | SHA-256 hash of the off-chain evidence blob, for tamper-evidence. |
| `response_uri` | `[u8; 128]` | 128 | Set by `append_response` (slice 5b). Zero until populated. |
| `response_hash` | `[u8; 32]` | 32 | Set by `append_response` (5b). |
| `has_response` | `bool` | 1 | `true` once `append_response` has been called. Distinguishes "no response yet" from "empty-URI response". |
| `revoked` | `bool` | 1 | Set by `revoke_feedback` (5c). Score engine ignores revoked feedback. |
| `created_slot` | `u64` | 8 | Slot of `give_feedback`. |
| `last_modified_slot` | `u64` | 8 | Slot of most recent state-change (response or revocation). Equals `created_slot` until then. |
| `bump` | `u8` | 1 | PDA bump. |
| `_padding` | `[u8; 64]` | 64 | Reserved. |

**Why per-payment seeds, not per-(service,agent)-pair:** binding feedback to a specific payment is what makes the on-chain claim verifiable. The `payment_receipt_hash` deterministically resolves to a `ReceiptUsed` PDA that proves the payment was recorded; that PDA names the `AgentServiceLink`, which proves the parties involved. Anyone can re-derive the chain from receipt hash alone.

### Instructions

#### `initialize_agent(agent_uri: [u8; 128], external_agent_id: u64)` *(slice 2)*

Creates an `AgentProfile` for the agent wallet. **Both** owner and agent must sign — see flow walkthrough below for why.

| Account | Type | Notes |
| --- | --- | --- |
| `owner` | `Signer<'info>`, `mut` | Human owner. Pays rent for the new account. |
| `agent` | `Signer<'info>` | Agent wallet. Co-signs to authorize this owner binding. Prevents griefing. |
| `agent_profile` | `Account<'info, AgentProfile>`, `init` | PDA seeded `["agent", agent.key()]`. `payer = owner`, `space = AgentProfile::ACCOUNT_SIZE`. |
| `system_program` | `Program<'info, System>` | Standard. |

**Effect:** initializes the PDA with the values listed above. Emits `AgentInitialized`.

**Custom errors:** none. Anchor's `init` constraint raises `AccountAlreadyInUse` on re-init. Missing signatures raise `MissingSignature` automatically. No custom error enum entries needed in this slice.

#### `register_service(name: [u8; 32], category: ServiceCategory)` *(slice 3)*

Creates a `ServiceRegistry` for the calling service wallet. Single-signature (no human owner — a service is self-sovereign; the wallet *is* the service).

| Account | Type | Notes |
| --- | --- | --- |
| `service` | `Signer<'info>`, `mut` | Service wallet. Pays rent. |
| `service_registry` | `Account<'info, ServiceRegistry>`, `init` | PDA seeded `["service", service.key()]`. `payer = service`, `space = ServiceRegistry::ACCOUNT_SIZE`. |
| `system_program` | `Program<'info, System>` | Standard. |

**Effect:** initializes the PDA with `authority = service`, `active = true`, and the supplied name + category. Emits `ServiceRegistered`.

**Custom errors:** none in v1. Anchor handles re-init and missing-signature. Name-length validation isn't needed because `[u8; 32]` is fixed-size at the type level.

**Why no dual signature here (unlike `initialize_agent`):** A service is its own root authority — there is no separate "owner" entity. The wallet pubkey *is* the service identity. Squatting requires the service's keypair, at which point the squatter *is* the service. The threat doesn't exist.

#### `record_payment(amount_usdc: u64, payment_receipt_hash: [u8; 32])` *(slice 4)*

Records that an x402 payment of `amount_usdc` flowed from the agent to the service. The service signs because the service is the natural attester — they're the party that witnessed the off-chain x402 settlement. The Phase 3 backend will later sit alongside this as an optional delegate path; the on-chain primitive remains service-attested.

| Account | Type | Notes |
| --- | --- | --- |
| `service` | `Signer<'info>`, `mut` | Receiving service wallet. Pays rent if the link PDA is being created. |
| `agent_profile` | `Account<'info, AgentProfile>`, `mut` | Counters bumped here. PDA derivation re-checked via seeds + bump. |
| `service_registry` | `Account<'info, ServiceRegistry>`, `mut` | Counters bumped here. `has_one = authority` ties the signing wallet to the registry. |
| `agent_service_link` | `Account<'info, AgentServiceLink>`, `init_if_needed` | PDA seeded `["link", agent_profile.key(), service_registry.key()]`. `payer = service`. |
| `receipt_used` | `Account<'info, ReceiptUsed>`, `init` | PDA seeded `["receipt", payment_receipt_hash]`. `payer = service`. `init` (not `init_if_needed`) — second use of the same hash fails with `AccountAlreadyInUse`. |
| `system_program` | `Program<'info, System>` | Standard. |

**Args:**

- `amount_usdc: u64` — payment amount in USDC lamports (USDC has 6 decimals). Must be `> 0`.
- `payment_receipt_hash: [u8; 32]` — hash of the off-chain x402 receipt (SHA-256 over the receipt's canonical JSON). Enforced **unique** across the program via the `ReceiptUsed` PDA — replay of the same hash, even across different `(agent, service)` pairs, is rejected.

**Effect (atomic):**

1. Check `service_registry.authority == service.key()` (Anchor `has_one` constraint).
2. Check `service_registry.active == true`.
3. Check `amount_usdc > 0`.
4. Detect first-pair payment: `let is_new_pair = link.agent == Pubkey::default();`.
5. If `is_new_pair`:
   - `link.agent = agent_profile.key()`
   - `link.service = service_registry.key()`
   - `link.first_payment_slot = slot`
   - `link.bump = ctx.bumps.agent_service_link`
   - `agent_profile.services_used = services_used.checked_add(1)?`
   - `service_registry.total_agents_served = total_agents_served.checked_add(1)?`
6. Always:
   - `agent_profile.total_transactions += 1` (checked)
   - `agent_profile.total_volume_usdc += amount_usdc` (checked)
   - `agent_profile.consecutive_success += 1` (checked)
   - `agent_profile.last_active_slot = slot`
   - `service_registry.total_volume_received_usdc += amount_usdc` (checked)
   - `service_registry.last_active_slot = slot`
   - `link.total_transactions += 1` (checked)
   - `link.total_volume_usdc += amount_usdc` (checked)
   - `link.last_payment_slot = slot`
7. Emit `PaymentRecorded`.

**Custom errors:** all introduced in this slice — see [Errors](#errors) below for stable codes.

- `ServiceInactive` — `service_registry.active == false`.
- `ZeroAmount` — `amount_usdc == 0`.
- `Overflow` — any of the eight checked-add operations.

Replay (same `payment_receipt_hash`) is rejected by Anchor's `AccountAlreadyInUse` on the `receipt_used` `init`. Wrong-signer-for-registry is rejected by the `[b"service", service.key()]` seed re-derivation on `service_registry`. Missing signature is rejected by Anchor's `Signer` constraint. No custom error code is needed for any of those three.

**V1 trust model — what record_payment does and does not prove.** The instruction proves that *the holder of the `ServiceRegistry`'s keypair attested to a payment*. It does **not** prove that the off-chain x402 settlement actually occurred. A malicious service can record fabricated payments to any registered agent — that inflates the agent's positive counters but also inflates the *service's own* `total_volume_received_usdc`, and the off-chain backend (Phase 3) is the layer that cross-checks attestations against witnessed x402 traffic. We accept this trade-off in v1 because (a) the service is the natural attester — they are the party that witnessed the off-chain payment — and (b) introducing a co-signer or on-chain settlement proof is the right unit of work for a later slice, not a Phase 1 prerequisite. The `ReceiptUsed` PDA bounds the impact: each off-chain receipt can be recorded at most once, so a malicious service must *fabricate* receipts rather than *replay* them.

#### `give_feedback(payment_receipt_hash: [u8; 32], value: i8, tags: u32, evidence_uri: [u8; 128], evidence_hash: [u8; 32])` *(slice 5a)*

A service files feedback about an agent for a specific payment. Mints a `FeedbackRecord` PDA and updates the agent's aggregate counters. ERC-8004 anti-self-rating is enforced on-chain.

| Account | Type | Notes |
| --- | --- | --- |
| `service` | `Signer<'info>`, `mut` | Service wallet. Pays rent for the new `FeedbackRecord`. |
| `agent_profile` | `Account<'info, AgentProfile>`, `mut` | Counters bump here. Anti-self-rating constraints enforced via `constraint =` on this account. |
| `service_registry` | `Account<'info, ServiceRegistry>`, `mut` | PDA-derived from `service.key()` — guarantees signer is the registry's authority. `last_active_slot` is bumped. |
| `agent_service_link` | `Account<'info, AgentServiceLink>` | Read-only. PDA-derived from `(agent_profile, service_registry)`. Used to verify the receipt belongs to this pair. |
| `receipt_used` | `Account<'info, ReceiptUsed>` | Read-only. PDA-derived from `payment_receipt_hash`. Existence proves the payment was recorded; `receipt_used.agent_service_link == agent_service_link.key()` proves it was *this pair's* payment. |
| `feedback_record` | `Account<'info, FeedbackRecord>`, `init` | PDA seeded `["feedback", payment_receipt_hash]`. `payer = service`. `init` (not `init_if_needed`) — at most one feedback per payment. |
| `system_program` | `Program<'info, System>` | Standard. |

**Args:**

- `payment_receipt_hash: [u8; 32]` — the payment this feedback is about. Must correspond to an existing `ReceiptUsed` PDA for the `(agent, service)` pair.
- `value: i8` — rating in `[-100, 100]`. Out-of-range → `InvalidFeedbackValue`.
- `tags: u32` — bitmask. No validation; meaning defined off-chain.
- `evidence_uri: [u8; 128]` — UTF-8, zero-padded.
- `evidence_hash: [u8; 32]` — SHA-256 over the canonical evidence blob.

**Effect (atomic):**

1. Anchor seeds derivation on `service_registry` proves signer is the service.
2. Anchor `constraint = service.key() != agent_profile.owner` on `agent_profile` → `SelfRating` if violated.
3. Anchor `constraint = service.key() != agent_profile.authority` on `agent_profile` → `SelfRating` if violated.
4. Anchor seeds derivation on `agent_service_link` proves it's the link for *this* `(agent, service)` pair.
5. Anchor seeds derivation on `receipt_used` proves the PDA address derives from the supplied hash.
6. Handler checks `receipt_used.agent_service_link == agent_service_link.key()` → `ReceiptMismatch` otherwise.
7. Handler checks `(-100..=100).contains(&value)` → `InvalidFeedbackValue` otherwise.
8. Populate `feedback_record` fields. `response_*` and `revoked` stay zero/false.
9. `agent_profile.total_feedback_count += 1` (checked).
10. If `value < 0`: `agent_profile.active_negative_feedback_count += 1` (checked), `agent_profile.consecutive_success = 0`.
11. Bump `agent_profile.last_active_slot` and `service_registry.last_active_slot`.
12. Emit `FeedbackGiven`.

**Custom errors introduced this slice** — see [Errors](#errors) below for stable codes.

- `SelfRating` — signer is the agent's owner or authority.
- `ReceiptMismatch` — the receipt doesn't belong to this `(agent, service)` pair.
- `InvalidFeedbackValue` — `value` outside `[-100, 100]`.

Double-feedback for the same payment is rejected by Anchor's `AccountAlreadyInUse` on the `feedback_record` `init`.

**Rate limit (slice 5d):** at most one `give_feedback` per `(service, agent)` per `FeedbackRecord::FEEDBACK_RATE_LIMIT_SLOTS` (216,000 slots ≈ 24 hours at 400ms/slot). The handler reads `agent_service_link.has_received_feedback` — if `true` AND `current_slot - last_feedback_slot < 216_000`, the call fails with `FeedbackRateLimited` (6009). On success, `last_feedback_slot` is set to the current slot and `has_received_feedback` is flipped to `true`. The link account becomes `mut` in `GiveFeedback` for these updates. The explicit flag (rather than a `last_feedback_slot == 0` sentinel) means the first feedback is recognised as "first" regardless of slot value — real feedback can land at slot 0 at genesis or in test environments.

#### `compute_score()` *(slice 6)*

Permissionless. Anyone may invoke `compute_score` for any agent — the instruction reads aggregated counters from `AgentProfile` and writes back the resulting `reputation_score: u16` in basis points `[0, 1000]`. No new accounts, no rent, no authorisation gate; the caller just pays the tx fee.

| Account | Type | Notes |
| --- | --- | --- |
| `caller` | `Signer<'info>`, `mut` | Any wallet. Pays the tx fee. No authority required — the score is a public function of public state. |
| `agent_profile` | `Account<'info, AgentProfile>`, `mut` | `reputation_score` and `last_active_slot` are written. |

**Args:** none. All inputs come from `agent_profile`.

##### Score formula

The score is the saturating sum of five components, each weighted to total `1000` basis points. All math is integer; piecewise brackets stand in for the log-scaling a typical reputation formula uses, keeping the implementation BPF-safe (no floats) and the score auditable by hand.

| Component | Weight | Driven by | Brackets |
| --- | --- | --- | --- |
| **Volume** | 250 | `total_transactions` | `0 → 0`, `1–9 → 50`, `10–99 → 125`, `100+ → 250` |
| **Diversity** | 200 | `services_used` | `50 × min(services_used, 4)` |
| **Streak** | 150 | `consecutive_success` | `10 × min(consecutive_success, 15)` |
| **Tenure** | 150 | `current_slot - first_active_slot` | `< 1d → 0`, `1–7d → 50`, `7–30d → 100`, `30d+ → 150`. Measures age from registration, not "active span" — a long-lived but quiet identity is harder to fake than a flurry of recent activity. |
| **Feedback** | 250 | `total_feedback_count` + `active_negative_feedback_count` | `no feedback → 100` (neutral); else `250 - (250 × active_negative / total)` (linear) |

`saturating_add` is used across all sums; the result is finally clamped to `1000` and truncated to `u16`. The score for a brand-new profile is **100** (neutral feedback bracket only — every other bracket evaluates to zero). The theoretical maximum **1000** is reached at `≥ 100` transactions, `≥ 4` unique services, `≥ 15` consecutive successes, `≥ 30 days` tenure, and zero active negative feedback.

`compute_score` is **idempotent for fixed inputs**: a second call with no intervening state change writes the same value (with a fresh `last_active_slot`).

**Why permissionless:** the score is a pure function of public on-chain state. Anyone who reads it can verify it; gating computation by signer would just add friction. In practice, the indexer (Phase 3) will call this on a schedule; the on-chain instruction is here so any party can demand a current value when the off-chain sweep is stale.

**Why the formula reads counters, not `FeedbackRecord`s:** the negative-feedback signal is already aggregated onto `AgentProfile` (`give_feedback` increments, `revoke_feedback` decrements). Re-summing per-record would require passing every `FeedbackRecord` PDA as a remaining_account — quadratic in feedback count. Aggregate counters are O(1) and the slice 5a/5c plumbing keeps them honest.

**Custom errors:** none — every code path saturates. The instruction is total over its inputs.

### Events

#### `append_response(payment_receipt_hash: [u8; 32], response_uri: [u8; 128], response_hash: [u8; 32])` *(slice 5b)*

The agent or its owner attaches a single rebuttal/response to an existing `FeedbackRecord`. Either party may sign — the **agent wallet** (operational autonomy) or the **human owner** (control-plane override). The response is one-shot per feedback (`has_response` flips to `true`); the chain holds the URI + hash, and the actual response payload is off-chain.

| Account | Type | Notes |
| --- | --- | --- |
| `responder` | `Signer<'info>`, `mut` | Either `agent_profile.owner` or `agent_profile.authority`. Constraint-checked. |
| `agent_profile` | `Account<'info, AgentProfile>`, `mut` | `last_active_slot` is bumped. Anchor `has_one = agent_profile` on `feedback_record` ties feedback to this profile. |
| `feedback_record` | `Box<Account<'info, FeedbackRecord>>`, `mut` | PDA seeded `["feedback", payment_receipt_hash]`. Must satisfy `has_response == false`. |
| `system_program` | `Program<'info, System>` | Standard. |

**Args:**

- `payment_receipt_hash: [u8; 32]` — identifies the `FeedbackRecord` via its seed.
- `response_uri: [u8; 128]` — UTF-8, zero-padded.
- `response_hash: [u8; 32]` — SHA-256 over the canonical response blob.

**Effect (atomic):**

1. Anchor `has_one = agent_profile` on `feedback_record` proves feedback belongs to this agent.
2. Anchor seeds re-derivation on `feedback_record` from the supplied hash proves the hash matches.
3. Anchor `constraint = responder.key() == agent_profile.owner || responder.key() == agent_profile.authority` → `UnauthorizedResponder`.
4. Handler checks `feedback_record.has_response == false` → `AlreadyHasResponse`.
5. Populate `response_uri`, `response_hash`, set `has_response = true`, bump `last_modified_slot`.
6. Bump `agent_profile.last_active_slot`.
7. Emit `ResponseAppended`.

**Why responses to revoked feedback are still allowed:** revoking a feedback (slice 5c) signals the *service* changed its mind; the agent may still want to acknowledge the resolution publicly. Filtering revoked entries from the score (slice 6) is the score engine's job, not this instruction's.

**Custom errors introduced this slice:**

- `UnauthorizedResponder` — signer is neither owner nor authority.
- `AlreadyHasResponse` — `feedback_record.has_response == true`.

#### `revoke_feedback(payment_receipt_hash: [u8; 32])` *(slice 5c)*

The original service retracts a feedback it filed. Flips `revoked = true` on the `FeedbackRecord` and — if the feedback was negative — decrements `agent_profile.active_negative_feedback_count` so the score engine stops counting it. Once flipped, the field is permanent (no un-revoke); revocation is a one-way operation.

| Account | Type | Notes |
| --- | --- | --- |
| `service` | `Signer<'info>`, `mut` | Must be the original feedback-giver. Bound via `[b"service", service.key()]` seed derivation on `service_registry` AND `has_one = service_registry` on `feedback_record`. |
| `agent_profile` | `Account<'info, AgentProfile>`, `mut` | `last_active_slot` is bumped. `active_negative_feedback_count` is decremented if the feedback was negative. `has_one = agent_profile` on `feedback_record` ties the feedback to this profile. |
| `service_registry` | `Account<'info, ServiceRegistry>`, `mut` | `last_active_slot` is bumped. |
| `feedback_record` | `Box<Account<'info, FeedbackRecord>>`, `mut` | PDA seeded `["feedback", payment_receipt_hash]`. Must satisfy `revoked == false`. |
| `system_program` | `Program<'info, System>` | Standard. |

**Args:**

- `payment_receipt_hash: [u8; 32]` — identifies the `FeedbackRecord` via its seed.

**Effect (atomic):**

1. Anchor seeds derivation on `service_registry` from `service.key()` proves the signer is the service registry's authority.
2. Anchor `has_one = agent_profile` and `has_one = service_registry` on `feedback_record` together prove this feedback belongs to *this* `(agent, service)` pair.
3. Handler checks `feedback_record.revoked == false` → `AlreadyRevoked`.
4. If `feedback_record.value < 0`: `agent_profile.active_negative_feedback_count -= 1` (checked, `Overflow` on underflow).
5. Set `feedback_record.revoked = true`, bump `last_modified_slot`.
6. Bump `agent_profile.last_active_slot` and `service_registry.last_active_slot`.
7. Emit `FeedbackRevoked`.

**Why `consecutive_success` is NOT restored on revoke:** the streak field's semantic is "successes since last *recorded* negative event", and we don't store enough history to rewind it correctly — other events may have intervened. The slice-6 score engine reconstructs streak-related signals from `FeedbackRecord` history when needed.

**Custom errors introduced this slice:**

- `AlreadyRevoked` — `feedback_record.revoked == true`.

`Overflow` (6000) can also be raised here, on the rare underflow of `active_negative_feedback_count` — that would indicate prior corruption since `give_feedback` is the only path that increments it.

### Events

#### `AgentInitialized`

| Field | Type | Notes |
| --- | --- | --- |
| `agent` | `Pubkey` | Indexer key. |
| `owner` | `Pubkey` | |
| `init_slot` | `u64` | |

`agent_uri` and `external_agent_id` are deliberately **not** in the event — the indexer can read them from the account itself. Keeps event payload small and lets us add more URI-related fields later without breaking event consumers.

#### `ServiceRegistered`

| Field | Type | Notes |
| --- | --- | --- |
| `service` | `Pubkey` | Indexer key. |
| `name` | `[u8; 32]` | Human-readable label, UTF-8 zero-padded. |
| `category` | `ServiceCategory` | Enum tag (1 byte). |
| `init_slot` | `u64` | |

#### `PaymentRecorded`

| Field | Type | Notes |
| --- | --- | --- |
| `agent` | `Pubkey` | `agent_profile.key()`. Indexer filter key. |
| `service` | `Pubkey` | `service_registry.key()`. |
| `amount_usdc` | `u64` | Amount in lamports (6 decimals). |
| `payment_receipt_hash` | `[u8; 32]` | Hash of the off-chain x402 receipt. |
| `was_new_pair` | `bool` | `true` iff this was the first payment between this `(agent, service)`. |
| `slot` | `u64` | Slot the payment was recorded at. |

#### `FeedbackGiven`

| Field | Type | Notes |
| --- | --- | --- |
| `agent` | `Pubkey` | `agent_profile.key()`. Indexer filter key. |
| `service` | `Pubkey` | `service_registry.key()`. |
| `feedback` | `Pubkey` | `feedback_record.key()`. |
| `payment_receipt_hash` | `[u8; 32]` | The payment this feedback is about. |
| `value` | `i8` | Rating value. |
| `tags` | `u32` | Tag bitmask. |
| `slot` | `u64` | Slot the feedback was filed at. |

#### `ResponseAppended`

| Field | Type | Notes |
| --- | --- | --- |
| `agent` | `Pubkey` | `agent_profile.key()`. Indexer filter key. |
| `feedback` | `Pubkey` | `feedback_record.key()`. |
| `responder` | `Pubkey` | The signer — either `agent_profile.owner` or `agent_profile.authority`. |
| `slot` | `u64` | Slot the response was appended at. |

#### `FeedbackRevoked`

| Field | Type | Notes |
| --- | --- | --- |
| `agent` | `Pubkey` | `agent_profile.key()`. Indexer filter key. |
| `service` | `Pubkey` | `service_registry.key()`. |
| `feedback` | `Pubkey` | `feedback_record.key()`. |
| `was_negative` | `bool` | `true` iff the revoked feedback had `value < 0` — lets indexers update aggregates without reading the FeedbackRecord. |
| `slot` | `u64` | Slot the revocation happened at. |

#### `ScoreComputed`

| Field | Type | Notes |
| --- | --- | --- |
| `agent` | `Pubkey` | `agent_profile.key()`. Indexer filter key. |
| `score` | `u16` | New score in basis points `[0, 1000]`. |
| `slot` | `u64` | Slot the score was computed at. |

### Errors

Error codes are stable. Once assigned, an integer is permanent — new errors get the next free code. Anchor reserves codes 0–5999; ours start at 6000.

| Code | Variant | Slice | Raised by |
| --- | --- | --- | --- |
| 6000 | `Overflow` | 4 | `record_payment` checked-add on any counter. |
| 6001 | `ServiceInactive` | 4 | `record_payment` when `service_registry.active == false`. |
| 6002 | `ZeroAmount` | 4 | `record_payment` when `amount_usdc == 0`. |
| 6003 | `SelfRating` | 5a | `give_feedback` when signer is the agent's owner or authority. |
| 6004 | `ReceiptMismatch` | 5a | `give_feedback` when `receipt_used.agent_service_link` doesn't match the link for the supplied `(agent, service)` pair. |
| 6005 | `InvalidFeedbackValue` | 5a | `give_feedback` when `value` is outside `[-100, 100]`. |
| 6006 | `UnauthorizedResponder` | 5b | `append_response` when signer is neither `agent_profile.owner` nor `agent_profile.authority`. |
| 6007 | `AlreadyHasResponse` | 5b | `append_response` when `feedback_record.has_response == true`. |
| 6008 | `AlreadyRevoked` | 5c | `revoke_feedback` when `feedback_record.revoked == true`. |
| 6009 | `FeedbackRateLimited` | 5d | `give_feedback` when current_slot is within `FEEDBACK_RATE_LIMIT_SLOTS` of the pair's `last_feedback_slot`. |

---

## Credit Vault Program

_Program ID: TBD (Devnet) / TBD (Mainnet)_

### Design constraints

- **Token:** USDC (6 decimals) is the intended deposit token. The program does **not** hardcode the mint — the owner supplies the mint at `create_vault`. Production owners will use the official USDC mint; tests use a locally-minted SPL token to keep LiteSVM self-contained.
- **Vault token holding:** the vault PDA owns an Associated Token Account (ATA) for the chosen mint. The PDA signs CPI transfers out via `invoke_signed` with the vault seeds. Owners and agents never hold the vault's USDC directly.
- **Per-(owner, agent) vault:** a given owner can fund one vault per agent. The seed pair `[owner, agent]` keys the PDA, so the same owner can fund multiple agents and the same agent can have vaults from multiple owners — both are common patterns (a team of agents under one budget, or one agent contracted by multiple companies).
- **Cross-program independence (for Phase 2):** the vault does not require the agent to have an `AgentProfile` on the reputation program. Phase 2 ships independently; reputation linkage (e.g., bumping `AgentProfile.total_volume_usdc` on spend) is a Phase 2.5 / Phase 3 concern.

### PDAs

#### `CreditVault` *(slice 2.1)*

The owner's funded budget for a specific agent. One per `(owner, agent)` pair. Holds the linkage to the vault's USDC token account; cumulative aggregates exposed for off-chain accounting.

| Property | Value |
| --- | --- |
| Seeds | `[b"vault", owner.key().as_ref(), agent.key().as_ref()]` |
| Total account size | **250 bytes** (8 discriminator + 242 data) |
| Lifetime | Created by `create_vault`. Never closed in v1. `frozen` toggles soft-disable. |

| Field | Type | Bytes | Notes |
| --- | --- | --- | --- |
| `owner` | `Pubkey` | 32 | Human owner. Matches the seed. Signs `deposit`, `withdraw`, `freeze`/`unfreeze`, `update_policy`. |
| `agent` | `Pubkey` | 32 | Agent wallet allowed to `spend`. Matches the seed. |
| `usdc_mint` | `Pubkey` | 32 | The deposit mint. Stored so spend/claim instructions can sanity-check the ATA mint without re-deriving from policy. |
| `vault_token_account` | `Pubkey` | 32 | Address of the PDA-owned ATA. Stored to skip ATA re-derivation on every spend. |
| `total_deposited` | `u64` | 8 | Cumulative deposits in lamports (6 decimals). |
| `total_withdrawn` | `u64` | 8 | Cumulative owner withdrawals. |
| `total_spent` | `u64` | 8 | Cumulative agent spend. |
| `total_claimed` | `u64` | 8 | Cumulative post-pay `claim` settlements (slice 2.12). |
| `frozen` | `bool` | 1 | `true` blocks `spend` and `claim`. Owner toggles via `freeze_vault` / `unfreeze_vault`. |
| `created_slot` | `u64` | 8 | Slot of `create_vault`. |
| `last_active_slot` | `u64` | 8 | Slot of most recent state-change. |
| `bump` | `u8` | 1 | PDA bump (stored for CPI signing). |
| `_padding` | `[u8; 64]` | 64 | Reserved. |

**Why store `vault_token_account` on the vault:** the ATA address is derivable from `(vault, usdc_mint)`, but every spend / claim / withdraw needs it, and re-deriving costs CU. The off-chain indexer also benefits from the explicit pointer.

#### `SpendPolicy` *(slice 2.1)*

The four-constraint policy that gates every `spend`. Stored separately from `CreditVault` so `update_policy` (slice 2.10) can rewrite the policy without disturbing vault aggregates, and so the rolling-window fields don't bloat the hot `CreditVault` account.

| Property | Value |
| --- | --- |
| Seeds | `[b"policy", vault.key().as_ref()]` |
| Total account size | **402 bytes** (8 discriminator + 394 data) |
| Lifetime | Created alongside `CreditVault` by `create_vault`. Mutated by `update_policy`. Never closed. |

| Field | Type | Bytes | Notes |
| --- | --- | --- | --- |
| `vault` | `Pubkey` | 32 | The vault this policy governs. |
| `whitelist` | `[Pubkey; 8]` | 256 | Allowed-service pubkeys. **All-zero sentinel** (every slot equals `Pubkey::default()`) = "allow any service" (no whitelist enforced). Otherwise the recipient service must equal one of the non-zero entries. Slice 2.5 / `update_policy` rewrites the whole array. |
| `per_tx_limit_usdc` | `u64` | 8 | Maximum single spend amount. `0` = no per-tx limit. |
| `hourly_limit_usdc` | `u64` | 8 | Maximum spend within a rolling ~9,000-slot window (≈ 1 hour). `0` = no hourly limit. |
| `lifetime_limit_usdc` | `u64` | 8 | Absolute ceiling on `vault.total_spent` (`spend` + `claim` both count). `0` = no lifetime limit. |
| `hourly_window_start_slot` | `u64` | 8 | First slot of the current hourly window. Reset by `spend`/`claim` when the window expires. |
| `hourly_window_spent_usdc` | `u64` | 8 | Cumulative spend within the current hourly window. Reset alongside `hourly_window_start_slot`. |
| `allow_post_pay` | `bool` | 1 | Whether services can settle via `claim` after delivering. Slice 2.12. |
| `bump` | `u8` | 1 | PDA bump. |
| `_padding` | `[u8; 64]` | 64 | Reserved. |

**Why a fixed `[Pubkey; 8]` array rather than a merkle root:** v1 vaults are scoped budgets — typical use is one agent paying a handful of services (data feed, compute, RPC). 8 entries covers the realistic ceiling. Merkle would save 224 bytes on `SpendPolicy` but cost an off-chain proof builder, a per-spend proof argument, and ~30 lines of in-program hash math. When real-world whitelists outgrow 8 entries we will add a merkle variant as its own slice; the on-chain code path for v1 stays a flat O(8) scan.

**Why limits use `0` as "unlimited" rather than a sentinel like `u64::MAX`:** a 0-amount spend is already a no-op (rejected by `ZeroAmount`), and "no limit configured" is the natural meaning of zero. `u64::MAX` would be ambiguous with a deliberately-maxed-out limit and harder to read off-chain.

### Instructions

#### `create_vault(per_tx_limit_usdc: u64, hourly_limit_usdc: u64, lifetime_limit_usdc: u64, allow_post_pay: bool)` *(slice 2.1)*

Initialises a `CreditVault`, its `SpendPolicy`, and the vault's PDA-owned USDC ATA. Owner-only signature; the agent doesn't need to consent because the vault is the *owner's* money — the agent is just being granted spend rights they can ignore.

| Account | Type | Notes |
| --- | --- | --- |
| `owner` | `Signer<'info>`, `mut` | Pays rent for the vault PDA, policy PDA, and the new ATA. |
| `agent` | `UncheckedAccount<'info>` | Agent wallet pubkey. Not a signer — see rationale above. Used as a seed only; account need not exist. |
| `usdc_mint` | `Account<'info, Mint>` | The deposit mint. Anchor validates it's a real `Mint`. |
| `vault` | `Box<Account<'info, CreditVault>>`, `init` | PDA seeded `["vault", owner, agent]`. `payer = owner`. |
| `policy` | `Box<Account<'info, SpendPolicy>>`, `init` | PDA seeded `["policy", vault]`. `payer = owner`. |
| `vault_token_account` | `Box<Account<'info, TokenAccount>>`, `init` | Associated token account: `associated_token::mint = usdc_mint, associated_token::authority = vault`. `payer = owner`. |
| `token_program` | `Program<'info, Token>` | spl-token (v1, not 2022). |
| `associated_token_program` | `Program<'info, AssociatedToken>` | For ATA creation. |
| `system_program` | `Program<'info, System>` | Standard. |

**Effect:**

1. Initialize `vault` with `owner`, `agent`, `usdc_mint`, `vault_token_account` (derived ATA address), zero counters, `frozen = false`, `created_slot = last_active_slot = current slot`, `bump`.
2. Initialize `policy` with all four limit values, `allow_post_pay`, `whitelist_root = [0u8; 32]` (all-allow sentinel), `hourly_window_*` = 0, `bump`. Vault pointer set to `vault.key()`.
3. ATA is initialised by Anchor's `associated_token::Create` CPI; the vault PDA becomes its authority.
4. Emit `VaultCreated`.

**Custom errors:** none in this slice. Anchor's `init` constraint catches re-creation; missing-signature is caught by `Signer`. Argument validation (e.g., "lifetime ≥ per-tx") is deliberately **not** enforced on-chain — the owner is paying for their own decisions, and forbidding "weird" configurations would just push complexity to the SDK without preventing misuse.

#### `deposit(amount_usdc: u64)` *(slice 2.2)*

The owner transfers USDC from their own token account into the vault's PDA-owned ATA via SPL-token CPI. Increments `vault.total_deposited`. Allowed even while the vault is frozen — freezing blocks `spend` and `claim`, not funding (the owner may legitimately want to top up before unfreezing).

| Account | Type | Notes |
| --- | --- | --- |
| `owner` | `Signer<'info>`, `mut` | Must equal `vault.owner` — enforced via `has_one = owner` on the vault. |
| `vault` | `Box<Account<'info, CreditVault>>`, `mut` | `total_deposited` + `last_active_slot` bumped. PDA seeds re-derived to confirm `vault.owner` matches the signer. |
| `owner_token_account` | `Box<Account<'info, TokenAccount>>`, `mut` | The owner's USDC ATA. `constraint = mint == vault.usdc_mint` ties it to the vault's chosen mint. |
| `vault_token_account` | `Box<Account<'info, TokenAccount>>`, `mut` | The vault's PDA-owned ATA. `constraint = key == vault.vault_token_account` blocks substitution. |
| `token_program` | `Program<'info, Token>` | spl-token (v1). |

**Args:**

- `amount_usdc: u64` — must be `> 0`. Out-of-band token-program checks (e.g., source balance) propagate naturally as transfer-CPI errors.

**Effect (atomic):**

1. Anchor `has_one = owner` on `vault` ties the signer to the vault.
2. Account-type validation confirms both token accounts and the mint linkage.
3. Handler checks `amount_usdc > 0` → `ZeroAmount`.
4. CPI: `spl_token::transfer` from `owner_token_account` → `vault_token_account`, signed by `owner`.
5. `vault.total_deposited += amount_usdc` (checked → `Overflow`).
6. `vault.last_active_slot = slot`.
7. Emit `Deposited`.

**Custom errors introduced this slice** — see [Errors](#errors-1) below.

- `Overflow` — checked-add on `total_deposited` would wrap.
- `ZeroAmount` — `amount_usdc == 0`.

The token transfer's own failure modes (insufficient owner balance, frozen owner token account, mint mismatch) surface as program-error returns from the SPL token CPI and don't need their own variants — the caller can inspect logs.

#### `spend(amount_usdc: u64)` *(slices 2.3 – 2.8)*

The agent transfers USDC from the vault's PDA-owned ATA to a service's ATA. The vault PDA signs the token-transfer CPI via `invoke_signed` with its `[b"vault", owner, agent, bump]` seeds — this is the central load-bearing primitive that makes the whole Phase 2 design work. Every spend runs through six policy checks, in this order:

1. **Vault not frozen** — `!vault.frozen`, else `Frozen`.
2. **Non-zero amount** — `amount_usdc > 0`, else `ZeroAmount`.
3. **Whitelist** — if any entry in `policy.whitelist` is non-zero, the recipient (`service_token_account.owner`) must appear in the array, else `NotWhitelisted`. All-zero array means no whitelist enforced.
4. **Per-tx limit** — if `policy.per_tx_limit_usdc > 0`, `amount_usdc <= per_tx_limit_usdc`, else `PerTxLimitExceeded`.
5. **Hourly rolling window** — if `policy.hourly_limit_usdc > 0`: if `current_slot - hourly_window_start_slot >= SLOTS_PER_HOUR` (9,000), reset the window (start = current slot, spent = 0). Then check `hourly_window_spent + amount <= hourly_limit`, else `HourlyLimitExceeded`.
6. **Lifetime ceiling** — if `policy.lifetime_limit_usdc > 0`, `vault.total_spent + amount <= lifetime_limit_usdc`, else `LifetimeLimitExceeded`.

All amount math uses `checked_add`; overflow surfaces as `Overflow`.

| Account | Type | Notes |
| --- | --- | --- |
| `agent` | `Signer<'info>` | Must equal `vault.agent` via `has_one = agent` on vault. |
| `vault` | `Box<Account<'info, CreditVault>>`, `mut` | PDA. The vault PDA's seeds + bump sign the CPI transfer. |
| `policy` | `Box<Account<'info, SpendPolicy>>`, `mut` | `has_one = vault` (via constraint). Hourly-window fields mutated in-place. |
| `vault_token_account` | `Box<Account<'info, TokenAccount>>`, `mut` | Source. Pinned via `key == vault.vault_token_account`. |
| `service_token_account` | `Box<Account<'info, TokenAccount>>`, `mut` | Destination. `mint == vault.usdc_mint` enforced. The owner of this ATA is the "service" for whitelist purposes. |
| `token_program` | `Program<'info, Token>` | spl-token (v1). |

**Effect:** runs the six checks above; on pass, CPI-transfers `amount_usdc` (PDA-signed), then bumps `vault.total_spent`, `vault.last_active_slot`, and `policy.hourly_window_spent_usdc`. Emits `Spent`.

#### `freeze_vault()` / `unfreeze_vault()` *(slice 2.9)*

Owner-only signature, flips `vault.frozen`. Two separate instructions for explicit caller intent and clean event semantics (separate `VaultFrozen` / `VaultUnfrozen` events).

| Account | Type | Notes |
| --- | --- | --- |
| `owner` | `Signer<'info>` | `has_one = owner` on vault. |
| `vault` | `Account<'info, CreditVault>`, `mut` | `frozen` toggled; `last_active_slot` bumped. |

**Errors:** `AlreadyFrozen` if `freeze_vault` is called on an already-frozen vault; `NotFrozen` if `unfreeze_vault` is called on an unfrozen vault. Idempotent flips would hide ownership errors at the call site.

#### `update_policy(new_per_tx_limit, new_hourly_limit, new_lifetime_limit, new_allow_post_pay, new_whitelist)` *(slice 2.10)*

Owner-only signature, rewrites the four limit values, the `allow_post_pay` flag, and the entire `whitelist` array. Does **not** touch the rolling-window counters (`hourly_window_start_slot`, `hourly_window_spent_usdc`) — limit changes apply going forward; in-flight windows continue with the new ceiling.

| Account | Type | Notes |
| --- | --- | --- |
| `owner` | `Signer<'info>` | `has_one = owner` on vault. |
| `vault` | `Account<'info, CreditVault>` | Used to authorise via seeds + has_one. |
| `policy` | `Box<Account<'info, SpendPolicy>>`, `mut` | Policy is rewritten. `has_one = vault` (constraint). |

**Args:** all five new policy values. The whitelist passes as `[Pubkey; 8]`; the caller pads unused slots with `Pubkey::default()`.

Emits `PolicyUpdated` carrying the full new state for indexer consumption.

#### `withdraw(amount_usdc: u64)` *(slice 2.11)*

Owner reclaims USDC from the vault back into their own ATA. PDA-signed transfer (same pattern as `spend`). Does **not** check `frozen` — freezing blocks `spend`/`claim`, not owner-initiated withdrawal. The owner can always recover their funds.

| Account | Type | Notes |
| --- | --- | --- |
| `owner` | `Signer<'info>`, `mut` | `has_one = owner` on vault. |
| `vault` | `Box<Account<'info, CreditVault>>`, `mut` | PDA. Signs the CPI. |
| `vault_token_account` | `Box<Account<'info, TokenAccount>>`, `mut` | Source. `key == vault.vault_token_account`. |
| `owner_token_account` | `Box<Account<'info, TokenAccount>>`, `mut` | Destination. `mint == vault.usdc_mint`. |
| `token_program` | `Program<'info, Token>` | |

**Args:** `amount_usdc: u64`, must be `> 0`.

**Effect:** PDA-signed CPI transfer vault → owner. Bumps `vault.total_withdrawn` (checked) and `last_active_slot`. Emits `Withdrawn`.

The token program enforces "can't withdraw more than the vault holds" — we don't duplicate that check on-chain.

#### `claim(amount_usdc: u64)` *(slice 2.12, post-pay settlement)*

A service settles a previously-delivered service by claiming USDC directly. Equivalent to `spend` but **service-signed** rather than agent-signed, and gated by `policy.allow_post_pay`. Runs the same six policy checks (frozen, zero, whitelist, per-tx, hourly, lifetime) plus the post-pay gate. Updates both `vault.total_spent` (so claims count toward lifetime/hourly ceilings) AND `vault.total_claimed` (so off-chain accounting can distinguish claim from spend).

| Account | Type | Notes |
| --- | --- | --- |
| `service` | `Signer<'info>` | Recipient. `service_token_account.owner == service.key()` enforced. |
| `vault` | `Box<Account<'info, CreditVault>>`, `mut` | PDA. Signs the CPI. |
| `policy` | `Box<Account<'info, SpendPolicy>>`, `mut` | Same checks as spend; rejects with `PostPayDisabled` if `!allow_post_pay`. |
| `vault_token_account` | `Box<Account<'info, TokenAccount>>`, `mut` | Source. |
| `service_token_account` | `Box<Account<'info, TokenAccount>>`, `mut` | Destination. Service is its owner. |
| `token_program` | `Program<'info, Token>` | |

Emits `Claimed`.

### Events

#### `VaultCreated`

| Field | Type | Notes |
| --- | --- | --- |
| `vault` | `Pubkey` | `vault.key()`. Indexer filter key. |
| `owner` | `Pubkey` | |
| `agent` | `Pubkey` | |
| `usdc_mint` | `Pubkey` | |
| `vault_token_account` | `Pubkey` | |
| `slot` | `u64` | |

#### `Deposited`

| Field | Type | Notes |
| --- | --- | --- |
| `vault` | `Pubkey` | `vault.key()`. Indexer filter key. |
| `owner` | `Pubkey` | The signer (always equals `vault.owner` post-`has_one`). |
| `amount_usdc` | `u64` | Amount in lamports (6 decimals). |
| `new_total_deposited` | `u64` | `vault.total_deposited` after the bump — lets indexers update without re-reading the vault. |
| `slot` | `u64` | |

#### `Spent`

| Field | Type | Notes |
| --- | --- | --- |
| `vault` | `Pubkey` | Indexer filter key. |
| `agent` | `Pubkey` | Signer (== `vault.agent`). |
| `service` | `Pubkey` | `service_token_account.owner`. |
| `amount_usdc` | `u64` | |
| `new_total_spent` | `u64` | Vault counter after the bump. |
| `slot` | `u64` | |

#### `Claimed`

| Field | Type | Notes |
| --- | --- | --- |
| `vault` | `Pubkey` | Indexer filter key. |
| `service` | `Pubkey` | Signer. |
| `amount_usdc` | `u64` | |
| `new_total_spent` | `u64` | |
| `new_total_claimed` | `u64` | |
| `slot` | `u64` | |

#### `VaultFrozen` / `VaultUnfrozen`

Both carry `{ vault: Pubkey, owner: Pubkey, slot: u64 }`.

#### `PolicyUpdated`

| Field | Type | Notes |
| --- | --- | --- |
| `vault` | `Pubkey` | |
| `owner` | `Pubkey` | |
| `per_tx_limit_usdc` | `u64` | New value. |
| `hourly_limit_usdc` | `u64` | New value. |
| `lifetime_limit_usdc` | `u64` | New value. |
| `allow_post_pay` | `bool` | New value. |
| `whitelist` | `[Pubkey; 8]` | New full array. |
| `slot` | `u64` | |

#### `Withdrawn`

| Field | Type | Notes |
| --- | --- | --- |
| `vault` | `Pubkey` | |
| `owner` | `Pubkey` | |
| `amount_usdc` | `u64` | |
| `new_total_withdrawn` | `u64` | |
| `slot` | `u64` | |

### Errors

Error codes are stable. Anchor reserves codes 0–5999; ours start at 6000. Numbering is per-program (the reputation program also uses 6000+).

| Code | Variant | Slice | Raised by |
| --- | --- | --- | --- |
| 6000 | `Overflow` | 2.2 | Any checked-add wrap (`deposit`, `spend`, `claim`, `withdraw`). |
| 6001 | `ZeroAmount` | 2.2 | `deposit` / `spend` / `claim` / `withdraw` when `amount_usdc == 0`. |
| 6002 | `Frozen` | 2.4 | `spend` / `claim` when `vault.frozen`. |
| 6003 | `NotWhitelisted` | 2.5 | `spend` / `claim` when recipient isn't in non-empty `policy.whitelist`. |
| 6004 | `PerTxLimitExceeded` | 2.6 | `spend` / `claim` when `amount_usdc > policy.per_tx_limit_usdc`. |
| 6005 | `HourlyLimitExceeded` | 2.7 | `spend` / `claim` when current window total + amount > `policy.hourly_limit_usdc`. |
| 6006 | `LifetimeLimitExceeded` | 2.8 | `spend` / `claim` when `vault.total_spent + amount > policy.lifetime_limit_usdc`. |
| 6007 | `AlreadyFrozen` | 2.9 | `freeze_vault` called on an already-frozen vault. |
| 6008 | `NotFrozen` | 2.9 | `unfreeze_vault` called on an unfrozen vault. |
| 6009 | `PostPayDisabled` | 2.12 | `claim` when `policy.allow_post_pay == false`. |

---

## Conventions

- **Account sizes:** every account includes an explicit `_padding` reserve so we can add fields later without migration pain. Reserve at least 64 bytes of padding on every PDA.
- **PDA bump storage:** every PDA stores its own `bump: u8` so we never re-derive at runtime.
- **Error codes:** stable integers, never reused. Once an error is defined, its code is permanent. New errors get the next free code.
- **Event names:** `<Subject><Verb>` past tense — `AgentInitialized`, `PaymentRecorded`, `VaultFrozen`. Include the agent or vault pubkey as the first field for indexer filtering.
- **Amount units:** USDC amounts are always `u64` in lamports (6 decimals). Never display lamports to users — convert at the client edge.
- **Slot vs timestamp:** on-chain we use slot. Off-chain we convert to UTC timestamps for display only.
