# ADR-0003: Adopt limited ERC-8004 compatibility in the Reputation Program

## Status

**Accepted** (2026-05-26). Pairs with [ADR-0004](0004-dispute-and-feedback-model.md) — both must be honoured or neither.

## Context

ERC-8004 (Trustless Agents) is the Ethereum agent-identity standard. It specifies three on-chain registries — **Identity**, **Reputation**, and **Validation** — backed by MetaMask, Google, and Coinbase, with ~72k EVM agents already registered. SATI (`github.com/cascade-protocol/sati`) implements ERC-8004 natively on Solana via an Anchor program already deployed to mainnet.

Critical findings from reading the spec ([eips.ethereum.org/EIPS/eip-8004](https://eips.ethereum.org/EIPS/eip-8004)):

- The standard is **Ethereum-specific in implementation, multi-chain in concept**, using a namespace scheme: `{namespace}:{chainId}:{contractAddress}`. Solana implementations are explicitly anticipated.
- **Payments are out of scope** — described verbatim as "orthogonal to this protocol." Our Credit Vault primitive does not conflict.
- Identity uses ERC-721 (NFTs). Each agent has an `agentURI` resolving to a registration JSON file with `name`, `description`, `services[]`, `x402Support: boolean`, `registrations[]` (cross-chain agent ID), `supportedTrust[]`.
- Reputation uses an int128 `value` + decimals + two string tags + endpoint + URI + hash, with `revokeFeedback` and `appendResponse` for symmetry.
- The spec explicitly states **"feedback submitter MUST NOT be the agent owner or an approved operator"** — solving self-rating attacks at the protocol level.

Two compatibility scopes are possible:

- **Full registry compatibility** — implement Identity + Reputation + Validation registries on Solana ourselves. This duplicates SATI.
- **Discoverability compatibility** — our `AgentProfile` exposes the fields required for an ERC-8004 client to *recognise* our agent, without us being a full registry.

## Decision

Adopt **discoverability compatibility**. Specifically:

1. **`AgentProfile` carries an `agent_uri` field** (`[u8; 128]`, points to a JSON registration file matching the ERC-8004 registration schema). Stored URI may be IPFS, Arweave, or HTTPS.
2. **`AgentProfile` carries an optional `external_agent_id` field** (`u64`, default 0) for agents already registered in an EVM ERC-8004 Identity Registry. Lets a single agent maintain one identity across ecosystems.
3. **Namespace declaration** — we publish our program ID as the Solana ERC-8004 namespace anchor: `solana:{mainnet|devnet}:{REPUTATION_PROGRAM_ID}`. Documented in the SDK README; no on-chain enforcement.
4. **No Validation Registry.** Defer indefinitely. SATI and others can fill that role.
5. **No standalone Reputation Registry instructions.** Our `record_payment` writes payment counters directly to `AgentProfile`; feedback is handled by the model in [ADR-0004](0004-dispute-and-feedback-model.md). We do not expose ERC-8004's `giveFeedback` / `readFeedback` registry interface — our `give_feedback` is named the same but is internal to our program, not a registry pattern.

What we **do not** do:
- We do not become an ERC-721 contract or NFT-mint agents. Our PDA-with-owner-and-agent model is simpler and matches the owner-vs-agent threat distinction the PRD requires. SATI's Token-2022 NFT route is unnecessary for us.
- We do not adopt the full Reputation Registry interface. Our reputation primitive is internal scoring fuel for the Credit Vault, not a general-purpose feedback registry.

## Consequences

**Pro:**
- An ERC-8004-aware client recognises Agent Fuel agents without any custom integration.
- Agents with EVM identity can point to it via `external_agent_id`; their cross-chain identity is preserved.
- We compose cleanly with SATI: a service can read SATI reputation feedback *and* Agent Fuel behavioural counters, and weigh them.
- Zero conflict with ERC-8004's payment-orthogonality clause — our Credit Vault sits exactly where the spec leaves space.

**Con:**
- 128-byte `agent_uri` reserved in every `AgentProfile`. Modest cost (~144 bytes total for the two new fields).
- We commit to maintaining the JSON-schema producer in the SDK (the function that generates an agent's registration file).
- Off-chain hosting cost for the JSON files (negligible — IPFS or a static CDN).

**Knock-on changes if accepted:**
- `docs/data-model.md` — `AgentProfile` gains `agent_uri: [u8; 128]` and `external_agent_id: u64`. Adjust account size and padding.
- `docs/phases.md` — Phase 1 Slice 2 (`AgentProfile` + `initialize_agent`) gains an `agent_uri` argument and the SDK gets a `generateRegistrationFile()` helper.
- `docs/scope.md` — explicitly mention ERC-8004 compatibility in the "what we are NOT building" anti-scope so readers know what we deliberately omit (no Identity Registry, no Validation Registry).

## Alternatives considered

- **No compatibility.** Rejected: needlessly isolates us from a backed standard at near-zero marginal cost. Future-us will pay to retrofit.
- **Full registry compatibility (be a Solana ERC-8004 Identity Registry).** Rejected: duplicates SATI's already-shipped work, and pulls us into a primitive that isn't our differentiator. We'd be doing SATI's job worse and slower.
- **Wait and see if EVM compatibility actually matters at our scale.** Rejected: the cost of adopting now is two struct fields; the cost of retrofitting after live agents exist is a migration. Asymmetric.

## References

- ERC-8004 spec: https://eips.ethereum.org/EIPS/eip-8004
- SATI's implementation (for cross-checking): https://github.com/cascade-protocol/sati
- Competitive analysis: [`../competitive-landscape.md`](../competitive-landscape.md)
