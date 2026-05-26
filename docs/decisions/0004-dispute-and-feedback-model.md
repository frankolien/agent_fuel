# ADR-0004: Dispute and feedback model — symmetric response, not blind commit-reveal

## Status

**Accepted** (2026-05-26). Pairs with [ADR-0003](0003-erc-8004-compatibility.md) — both must be honoured or neither. Replaces PRD §6.4 `record_dispute`.

## Context

The PRD §6.4 specifies a one-instruction dispute model: a service calls `record_dispute(agent)`, which increments `agent_profile.dispute_count` and resets `consecutive_success` to 0. This is unilateral — the agent has no on-chain mechanism to refute, and the score impact is immediate.

The **grief vector** this opens: a malicious or careless service can tank any agent's reputation with a single signed instruction. Once the score is below the post-pay threshold (800/1000), the agent loses credit features. There is no on-chain recourse.

**Two precedents were studied:**

1. **SATI's blind feedback (FeedbackV1 schema).** Agents pre-commit to their response *before* the reviewer's score is disclosed. Anti-cherry-picking via cryptographic commitment. Documentation is light on the workflow; the README confirms the principle but defers byte-level detail to external spec docs. *Designed for content/response rating, not payment-quality disputes.*

2. **ERC-8004 Reputation Registry.** Feedback is a public on-chain record with `value` (int128, signed), `valueDecimals`, two tags, `feedbackURI` for evidence, `feedbackHash` for tamper detection. The anti-grief mechanism is **`appendResponse`** (agent posts their side alongside the feedback) and **`revokeFeedback`** (client can withdraw if they were wrong). The spec also rules out the most common attack — self-rating — by stating: *"feedback submitter MUST NOT be the agent owner or an approved operator."*

**Critical realisation:** our domain is **payment-quality disputes** (service didn't deliver, double-charged, timeout, etc.), not **content-quality rating** (the agent's response was wrong). For payment disputes, the on-chain transaction signature is itself strong evidence. Both parties have cryptographic receipts. The dispute is about *interpretation of an already-on-chain event*, not commitment to undisclosed information. Blind commit-reveal solves a problem we don't have.

## Decision

Adopt **ERC-8004's symmetric-feedback semantics** for our dispute model. Specifically:

1. **Replace the PRD's `dispute_count: u32` field on `AgentProfile`** with a per-feedback on-chain record. Keep aggregated counters on the profile for fast reads — `total_feedback_count: u32` and `active_negative_feedback_count: u32` (the latter excludes revoked entries) — but the full record lives in its own PDA.

2. **New PDA: `FeedbackRecord`** — seeds `["feedback", service, agent, feedback_index]`. Fields:
   - `service: Pubkey`
   - `agent: Pubkey`
   - `value: i64` — signed score. Positive = praise, negative = complaint. `i64` rather than `i128` because Anchor handles it more cleanly and we don't need the dynamic range.
   - `value_decimals: u8`
   - `tag1: [u8; 32]`, `tag2: [u8; 32]` — short categorical tags (`"non-delivery"`, `"double-charge"`, `"sla-exceeded"`, etc.).
   - `payment_signature: [u8; 64]` — the originating spend transaction this feedback is about. Optional (zero-filled if not payment-tied).
   - `feedback_uri: [u8; 128]` — pointer to off-chain evidence (IPFS / Arweave / HTTPS).
   - `feedback_hash: [u8; 32]` — hash of the off-chain evidence.
   - `agent_response_uri: [u8; 128]` — agent's rebuttal pointer. Zero-filled until `append_response` is called.
   - `agent_response_hash: [u8; 32]`.
   - `revoked: bool`.
   - `slot: u64`, `bump: u8`, `_padding: [u8; 32]`.

3. **Three new instructions** (replacing the PRD's single `record_dispute`):
   - `give_feedback(value, tag1, tag2, payment_sig, feedback_uri, feedback_hash)` — signed by **service**. Constraint enforced on-chain: `service != agent_profile.authority && service != agent_profile.owner` (the ERC-8004 self-rating prohibition).
   - `append_response(feedback_index, response_uri, response_hash)` — signed by **agent or owner**. Lets the agent post their side. The response is *additive*, not gating — the feedback still counts unless revoked.
   - `revoke_feedback(feedback_index)` — signed by **the original feedback service**. Sets `revoked = true`. Revoked entries are excluded from score computation.

4. **`compute_score` updates.** The PRD's dispute factor becomes `max(1.0 - (active_negative_feedback / total_tx * 10), 0)` where `active_negative_feedback` excludes revoked entries. Positive feedback (`value > 0`) does not subtract from score in v1 (it could feed a separate "praise weight" later — out of scope now).

5. **Rate limit.** A service may file at most **1 feedback per `(service, agent)` per 24 hours** (~216,000 slots). Enforced on-chain via `last_feedback_slot` stored on `AgentProfile`'s services array entry, or a small `ServiceAgentInteraction` PDA. Final field choice left to the data-model spec.

6. **No blind commitment.** Rejected explicitly. See alternatives.

## Consequences

**Pro:**
- An agent can no longer be silently grieved. Even uncontested negative feedback carries the agent's response if they choose to file one, which is itself a reputational signal for reviewers.
- The structure is ERC-8004 compatible. Services that already speak ERC-8004 feedback (or want to) need no Agent Fuel-specific dialect.
- Revocation gives services an honest way to correct mistakes (`give_feedback` filed too quickly, etc.) instead of permanently distorting an agent's score.
- The `payment_signature` field anchors most feedback to an on-chain payment receipt, making frivolous complaints traceable.

**Con:**
- Phase 1 reputation scope grows. **The PRD's Slice 5 (`record_dispute`) splits into Slices 5a, 5b, 5c (give/respond/revoke) and Slice 5d (rate-limit enforcement).** Estimated +1 week to Phase 1.
- More on-chain storage per dispute (~512 bytes per `FeedbackRecord` vs. a u32 counter increment).
- The score formula gets slightly more complex (must read feedback list to count active negatives), but this happens in the off-chain score engine, not on-chain — `compute_score` reads pre-aggregated counters from `AgentProfile`.

**Knock-on changes if accepted:**
- `docs/data-model.md` — drop the PRD's `dispute_count: u32` from `AgentProfile` (replace with `total_feedback_count: u32` and `active_negative_feedback_count: u32`). Add the `FeedbackRecord` PDA spec.
- `docs/phases.md` — Phase 1 slice list updated: 5 → 5a/5b/5c/5d, plus a small revision to slice 6 (`compute_score`) to read the new fields.
- `docs/scope.md` — update problem #1 framing: "no agent reputation" is now "no payment-quality feedback primitive tied to credit"; reflects the richer model.

## Alternatives considered

- **Status quo (PRD's binary `dispute_count`).** Rejected: ships a known grief vector. Externally reviewed code probably won't pass scrutiny with this primitive.
- **SATI-style blind commit-reveal.** Rejected: solves a problem we don't have. Our disputes are about *interpretation of already-on-chain payments*, not undisclosed off-chain content. Commit-reveal adds two extra instructions, a commitment-store PDA, and a reveal-window timer for marginal-at-best benefit in our domain.
- **Rate-limiting only, keep binary counter.** Rejected: addresses the volume of grief, not its substance. An agent still has no recourse against a single false dispute.
- **Off-chain dispute resolution (file disputes to backend, not chain).** Rejected: contradicts our "on-chain is source of truth" principle from `algorithm.md`. Backend-mediated reputation is also exactly what every existing reputation API does — we'd be ceding our differentiation.
- **Stake-and-challenge (service stakes USDC to dispute, agent counter-stakes, arbitrator slashes loser).** Rejected: too complex for v1. The PRD §15 lists this as an open question; properly belongs in a v2 dispute-arbitration RFC.

## References

- ERC-8004 spec, Reputation Registry section: https://eips.ethereum.org/EIPS/eip-8004
- SATI README (limited detail on blind-feedback): https://github.com/cascade-protocol/sati
- PRD §6.1, §6.4, §10.1, §15 (dispute resolution open question)
- Competitive analysis: [`../competitive-landscape.md`](../competitive-landscape.md)
