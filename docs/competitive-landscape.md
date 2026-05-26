# Competitive Landscape

> Snapshot taken 2026-05-26 from the public sites + GitHub repos of three projects in adjacent or overlapping problem space.
> The point is **not** a market-research document. The point is to identify what already exists so we don't duplicate, and to surface design choices we should revisit in the PRD.

## TL;DR

| Project | Problem space | Status | Our overlap |
| --- | --- | --- | --- |
| **SAID Protocol** | Cross-chain agent identity + reputation + x402 micropayments | Live, multi-chain (Solana primary + 10 via ERC-8004), 11+ partners | High on identity + reputation, low on credit/policy |
| **SATI** (Cascade Protocol) | Solana-native agent identity + reputation + blind-feedback validation | Mainnet program deployed (`satiRkxEiwZ51cv8PRu8UMzuaqeaNU9jABo6oAFMsLe`), 30 releases, active through Mar 2026 | **Direct overlap** on reputation; different identity model |
| **OpenDexter** | Multi-chain x402 API discovery + payment gateway | Live, 21k endpoints tracked, 834 active | Medium on x402 flow, none on policy/credit/reputation-of-agents |

**The headline:** We are **not first** to agent reputation on Solana. SATI ships the same primitive with a more sophisticated anti-gaming mechanism (blind feedback). SAID covers identity + payment at cross-chain scope. OpenDexter does the inverse — reputation *of services*, not of agents.

**Our remaining moat — credit vaults with on-chain spending policies and post-pay credit** — is real. Nobody in this list does it. This is what the PRD bets on, and that bet looks correct.

## The three projects in detail

### SAID Protocol — `saidprotocol.com` · [github.com/kaiclawd/said](https://github.com/kaiclawd/said)

**Scope:** Cross-chain agent identity, reputation tracking, messaging, x402 micropayments. Solana is the primary chain; resolves 72k+ EVM agents via ERC-8004 bridge standards.

**Technical posture:**
- Agent registration via Solana PDAs with off-chain metadata URIs.
- TypeScript SDK with WebSocket + REST, HMAC-SHA256 webhook signatures.
- x402 integration for USDC micropayments at **$0.01 per message**.

**Business model:** Freemium — 10 messages/day free, $0.01 USDC/message paid tier, 0.01 SOL one-time for a verification badge.

**Where we don't overlap:** No credit vault, no spending policy, no per-transaction or per-hour limits, no post-pay. Identity is metadata-pointer style (URI), not the rich behavioural counters our `AgentProfile` has.

### SATI — Solana Agent Trust Infrastructure — [github.com/cascade-protocol/sati](https://github.com/cascade-protocol/sati)

**This is the project that overlaps us most directly. Read this section carefully.**

**Scope:** On-chain agent identity, reputation, and validation on Solana. Implements ERC-8004 (the Ethereum agent-identity standard backed by MetaMask, Google, Coinbase) natively on Solana.

**Technical posture:**
- **Anchor-based program**, already deployed to mainnet AND devnet.
- Agents register as **Token-2022 NFTs** (visible in Phantom/Solflare). Different identity model from our PDA-only approach.
- Feedback stored as **Light Protocol compressed attestations** — ~$0.002 per attestation. *Dramatically cheaper than uncompressed on-chain.*
- Uses Solana Attestation Service for aggregates.
- **Blind feedback** mechanism: agents sign a cryptographic commitment to their response *before* the reviewer's score is disclosed. Prevents cherry-picking and is more rigorous than our PRD's naive `dispute_count`.
- TypeScript SDK: `@cascade-fyi/sati-agent0-sdk`.
- 81% TypeScript, 18% Rust. Apache 2.0. 30 releases, active March 2026.

**Where we don't overlap:** Credit vault, spend policy, post-pay claims, ownership separation (owner ≠ agent), budget enforcement. SATI is reputation-only; the wallet management problem is out of their scope.

**What we should adopt or seriously consider:**
1. **ERC-8004 compatibility.** Interop with the EVM agent ecosystem at near-zero cost.
2. **Light Protocol compression for high-volume events.** Our PRD writes full event records to Postgres but events are also redundant chain data. At their volume (~$0.002/attestation) we could store far richer per-spend history on-chain than the PRD assumes.
3. **Blind-feedback dispute model.** Our PRD's `record_dispute` is a service-signed unilateral increment. SATI's commitment-then-reveal model is harder to game. Worth an ADR on whether to upgrade before Phase 1 ships.

**What we should NOT adopt:** Token-2022 NFT for identity. NFTs imply transferable ownership and a marketplace surface; our PDA-with-owner-and-agent-pubkey is simpler and matches our threat model (owner stays put, agent key may rotate).

### OpenDexter — `dexter.cash/opendexter`

**Scope:** x402 API discovery + payment gateway for AI agents. Tracks the **service** side of the x402 economy, not the agent side.

**Technical posture:**
- Multi-chain USDC wallet (Solana, Base, Polygon, Arbitrum, Optimism, Avalanche).
- Implements x402.
- Seven tools: search, cost preview, payment + call, identity-based access, spend caps. Spend caps are client-side, not on-chain.
- **Quality control via real-money testing**: every 15 minutes the system pays each listed endpoint and rates the response with a frontier model. Endpoints scoring below 51/100 are delisted.
- Catalogue: 21,734 endpoints tracked, 834 active.

**Where we don't overlap:** OpenDexter rates *services* (the API the agent is calling), not agents. Our `ServiceRegistry` is the closest analogue, but we deliberately keep service reputation thin. OpenDexter could plausibly *consume* Agent Fuel reputation data — they don't have an agent-side primitive.

## Design implications for Agent Fuel

Three open questions surfaced by this analysis. Each deserves an ADR before we lock the data model.

### 1. ERC-8004 compatibility

**Question:** Should our `AgentProfile` PDA expose an ERC-8004-compatible interface so EVM ecosystem tools recognise our agents?

**Tradeoff:** Modest extra fields and a serialization layer in the SDK. In return, we slot into a standard backed by MetaMask/Google/Coinbase. SATI already did this — being incompatible would be a deliberate isolation decision.

**Recommendation:** Yes, adopt. Cheaper now than retrofitting later.

### 2. Light Protocol compression for events

**Question:** Should `record_payment` and dispute events be stored as Light Protocol compressed attestations instead of (or alongside) plain Anchor account writes?

**Tradeoff:** Massive cost reduction (~$0.002 vs full account rent) but a real dependency on Light Protocol's compression infrastructure. Adds a layer the indexer has to decompress.

**Recommendation:** Defer. Phase 1 ships without it; revisit at the end of Phase 2 once we know real event volume. Premature optimization to add now.

### 3. Blind-feedback for disputes

**Question:** Should our `record_dispute` use a commit-reveal scheme instead of the PRD's unilateral service-signed increment?

**Tradeoff:** More instructions (commit, reveal), more on-chain state (commitments outstanding), more complex backend flow. Real anti-gaming benefit.

**Recommendation:** Worth seriously considering. The PRD's open question §15 already flags "should there be an arbitration mechanism?" — this is the answer. Probably belongs in v1 since it's central to the reputation primitive's credibility.

## Where our moat is

These primitives are uniquely ours in the comparison set:

1. **Credit Vault PDA owning a USDC ATA** — agent spends without holding funds. Neither SAID, SATI, nor OpenDexter does this.
2. **On-chain spending policy** with per-tx, per-hour rolling window, lifetime ceiling, whitelist, freeze. The wallet-budget primitive is genuinely missing from the ecosystem.
3. **Post-pay credit** for high-reputation agents. The combination of *our* reputation + *our* policy + a deferred-settlement instruction is what makes this work — no competitor has the prerequisites.
4. **Owner / agent separation** — explicit modeling of human funder vs autonomous spender. The basis for the entire policy enforcement model.

**Sharpen the pitch:** Agent Fuel is not "reputation on Solana." That space is taken. Agent Fuel is **the credit and policy layer for x402 agents, with reputation as the input signal that unlocks credit features.** The reputation primitive exists to feed the credit primitive. Lead with the vault, not the score.

## Next actions

- [x] [ADR-0003](decisions/0003-erc-8004-compatibility.md): ERC-8004 discoverability compatibility — **Accepted** 2026-05-26.
- [x] [ADR-0004](decisions/0004-dispute-and-feedback-model.md): Symmetric feedback model over blind commit-reveal — **Accepted** 2026-05-26.
- [x] `scope.md` reframed to lead with the vault; ERC-8004 items added to anti-scope.
- [x] `phases.md` Phase 1 expanded: Slice 2 carries `agent_uri` / `external_agent_id`; Slice 5 splits into 5a/5b/5c/5d. Timeline revised to 5 weeks.
- [x] `data-model.md` Reputation Program section gained a "Design constraints from ADRs" subsection.
- [x] `glossary.md` gained `ERC-8004`, `FeedbackRecord`, `symmetric feedback`, `agent_uri`.
- [x] Re-read SATI's [program source](https://github.com/cascade-protocol/sati) — done 2026-05-26, full writeup in [`sati-reference.md`](sati-reference.md). Confirmed our design is materially distinct; surfaced 7 small patterns worth folding into Phase 1.
