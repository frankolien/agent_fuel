# SATI Reference — Account Layout, Patterns, Divergences

> Notes from reading SATI's actual on-chain program source (commit fetched 2026-05-26 from `github.com/cascade-protocol/sati`, Apache-2.0).
> Purpose: **prove our design is genuinely distinct, identify patterns worth adopting with attribution, and flag patterns to deliberately avoid.** Not a transcription of their code.

## At a glance

| Aspect | SATI | Agent Fuel |
| --- | --- | --- |
| Program LoC (Rust) | ~3,500 | TBD |
| Identity primitive | **Token-2022 NFT** mint (with MetadataPointer + GroupMemberPointer + optional NonTransferable + TokenMetadata + GroupMember extensions) | **`AgentProfile` PDA** seeded by agent wallet pubkey |
| Identity enumeration | `AgentIndex` PDA per agent (`["agent_index", member_number_le]`) | Off-chain via Helius indexer (no on-chain enumeration PDA) |
| Singleton config | `RegistryConfig` PDA (`["registry"]`) holding group mint + authority + total count | None — we have no global registry; each `AgentProfile` is independent |
| Feedback storage | **Light Protocol compressed accounts** (~$0.002/feedback) + SAS (Solana Attestation Service) for queryable types | Plain Anchor PDA `FeedbackRecord` (Phase 1; Light Protocol deferred per ADR-0004 follow-up) |
| Feedback schema | Universal 131-byte base layout shared across all types + variable content up to 512 bytes | Fixed Anchor account, ~512 bytes including evidence URIs |
| Feedback value | `outcome: u8` enum (0=Negative, 1=Neutral, 2=Positive) — only 3 values | `value: i64` with `valueDecimals: u8` — full signed range |
| Signature modes | Three: `DualSignature`, `CounterpartySigned`, `AgentOwnerSigned` | One: counterparty-signs (single mode, simpler) |
| EVM linking | `link_evm_address` instruction (secp256k1 sig verify on-chain) | `external_agent_id: u64` field only (no on-chain link, off-chain registration JSON does the mapping) |
| Default feedback model | `FeedbackPublicV1` = single counterparty signature (matches ERC-8004 baseline) | Same — single counterparty signature |
| Optional rigour | `FeedbackV1` adds agent-side blind commitment | Not in v1 (rejected per ADR-0004; revisit if needed) |
| Cross-program deps | Light Protocol, SAS, Token-2022, Token Metadata Interface, Token Group Interface | SPL Token (USDC transfers in Credit Vault), no Light/SAS |

**Bottom line:** the surface area genuinely doesn't overlap. SATI's identity is a Token-2022 NFT — a fundamentally different model from our PDA-with-owner-and-agent-pubkey. Their feedback storage is compressed via Light Protocol; ours is a plain PDA. Their value semantics are 3-valued; ours are signed integer. Even the things we share (ERC-8004 discoverability, single-signature feedback as the default) are spec-level shapes, not implementation duplications.

## Things worth adopting (with attribution)

These are **general engineering patterns**, not SATI-specific code. Apache-2.0 lets us study and reuse approaches freely. We should still note in commit messages or ADRs that we picked them up from reading SATI.

### 1. `solana_security_txt::security_txt!` macro

SATI embeds a `security_txt!` block in `lib.rs` (their lines 21–29). It compiles security contact info into the program binary, where audit tools and chain explorers can surface it. Costs ~120 bytes of program data.

**Adopt for both programs.** Free, signals professionalism, audit-friendly. Add during Phase 1 Slice 1 (workspace scaffold).

### 2. Three-phase handler structure

Every SATI handler follows: **(1) read state into locals + drop borrows → (2) make CPIs → (3) write state**. The explicit comment "Borrow is now dropped - safe to make CPIs" appears in `register_agent.rs`. This prevents re-entrancy mutation hazards.

**Adopt as a convention** in our build algorithm. I'll add a note to `algorithm.md`'s code section.

### 3. `checked_add` / `checked_mul` everywhere

SATI uses `.checked_add(x).ok_or(SatiError::Overflow)?` on every arithmetic operation, not just where overflow seems likely. Defence-in-depth.

**Adopt.** Our PRD has counters that can in principle reach u64::MAX (cumulative volume). Every increment should be checked. We add an `Overflow` error code matching their `SatiError::Overflow`.

### 4. Discriminator-stability tests

SATI has `test_compressed_attestation_discriminator_backward_compat` that recomputes `SHA256("CompressedAttestation")[0..8]` and asserts it matches the macro-derived discriminator. If anyone refactors and the name changes, mainnet deserialization breaks — and this test catches it before deploy.

**Adopt.** Once we have an `AgentProfile`, write a test pinning its 8-byte discriminator. Repeat for every account type. Catches a class of accidental breakage that's otherwise invisible.

### 5. Domain-separator constants for hashes

SATI defines `DOMAIN_INTERACTION = b"SATI:interaction:v1"`, `DOMAIN_FEEDBACK = b"SATI:feedback:v1"`, etc. Standard prefix-domain pattern preventing cross-protocol signature replay.

**Adopt if/when we add any signing flow** (e.g., off-chain feedback evidence signed by service). Currently we don't — but if Phase 2's `create_vault` ends up needing an off-chain signed deposit intent, this is how.

### 6. Self-attestation rejection on-chain

SATI's `SelfAttestationNotAllowed` error fires when `agent_mint == counterparty`. We've already committed to the equivalent in ADR-0004 (`service != agent.owner && service != agent.authority`) — just confirming the precedent is solid.

### 7. Error catalogue style

SATI's `errors.rs` is one file, one enum, one `#[msg("...")]` per variant with human-readable text. Grouped by domain (Registry / Attestation / Delegation / EVM Linking / Tree Validation). Easy to read, easy to grep.

**Adopt the structure.** Our error enum will be in `programs/reputation/src/errors.rs` and `programs/credit_vault/src/errors.rs`, same shape.

## Things to deliberately not adopt

### 1. Token-2022 NFT for identity

We already rejected this in ADR-0003. Reading SATI's `register_agent.rs` (423 lines, **11 CPI calls** in one instruction — initialize mint, init metadata pointer, init group member pointer, init non-transferable, init mint, init token metadata, optionally update metadata fields, init group member, create ATA, mint_to, set authority to None) makes the cost concrete. Our PDA `init` is ~20 lines.

**Confirmed: PDA identity stays.** The NFT route would more than triple our Phase 1 Slice 2 implementation cost, with no benefit we actually need (we don't want transferable agent identity).

### 2. Light Protocol compression in v1

ADR-0004's follow-up implies "revisit at end of Phase 2." SATI's `create_compressed_attestation.rs` brings in `light-sdk`, `light-hasher`, Light's CPI signer machinery, and Photon-RPC-dependent indexing. Significant complexity that's only worth it if our feedback volume actually hits the cost wall.

**Defer until we have volume data.** Phase 1 ships uncompressed; if a feedback PDA at ~512 bytes × N agents × M feedback-each becomes a rent problem, revisit.

### 3. Three signature modes via runtime enum

SATI's `SignatureMode` enum makes their attestation instruction polymorphic — one handler that branches by mode. Powerful but the branch logic in `create_compressed_attestation.rs` is real overhead.

**Stay single-mode.** Our `give_feedback` is counterparty-signed, period. If we ever need agent-side blind commitment, it goes in a *different instruction* (e.g., `give_feedback_committed`), not a runtime branch.

### 4. `String` fields in account args

SATI uses `String` for `name`, `symbol`, `uri`, `additional_metadata` keys/values, then runtime-checks `len() <= MAX_*`. Two costs: variable-length serialization complexity, and the length check is a runtime error not a type-level guarantee.

**We use `[u8; N]` fixed arrays.** ADR-0003 specifies `agent_uri: [u8; 128]`. Account size is predictable, no length-check error path. Cost: URIs must fit in 128 bytes (they will — IPFS hashes are 46 bytes, an HTTPS URL with reasonable path is well under).

### 5. Universal base layout

SATI's 131-byte universal prefix across all attestation schemas is clever for a system with N schema types. We have one feedback schema in v1. Premature abstraction for our case — skip.

## Specific things I noticed worth flagging

1. **SATI uses LiteSVM (`litesvm = "0.7"`) and Mollusk (`mollusk-svm = "0.5"`) for tests.** Matches the Foundation skill's recommendation. We should adopt LiteSVM as our default test runner in Phase 1 — confirms the ADR-0005 (testing-stack) we still need to write.

2. **They include `solana-security-txt`.** Add to our `Cargo.toml` in Phase 1.

3. **`event_cpi` Anchor feature** is enabled — emits events via CPI rather than just logs, which keeps them visible even in nested invocations. Worth using.

4. **Rust toolchain pin** in `rust-toolchain.toml` (`channel = "1.89.0"`). Pinning explicitly avoids the dependency-on-system-rust headache. We should do the same.

5. **`pnpm` for the workspace package manager.** Matches our `dependencies.md` choice — small confirmation we're on a sensible default.

6. **Pre-deployed program ID** (`satiRkxEiwZ51cv8PRu8UMzuaqeaNU9jABo6oAFMsLe`) starts with `sati` — they used `solana-keygen grind` to vanity-mint it. Nice-to-have for ours; we could grind `agentf...` or `fuel...`. Cheap, do it once near Phase 1 end.

7. **Their `Anchor.toml`** uses `[programs.localnet]`, `[programs.devnet]`, `[programs.mainnet]` with the same ID across all clusters. That's the modern multi-cluster pattern. Adopt.

8. **No `freeze_authority`** on their NFT mints (initialized as `None`). Discipline: don't give yourself freeze power you don't need. Mirrors our "owner cannot mint from the vault" separation principle.

## What this means for Phase 1

No design changes required. ADR-0003 and ADR-0004 still stand. The reading confirmed:

- Our design is materially distinct from SATI's. No accidental near-duplication risk.
- ADR-0004's single-signature default is the right call — even SATI ships single-sig (`FeedbackPublicV1`) as their default.
- Three additional small wins to fold into Phase 1 Slice 1:
  - Add `solana-security-txt` and a `security_txt!` block.
  - Pin Rust toolchain in `rust-toolchain.toml`.
  - Standardise on `[u8; N]` fixed arrays for all URI / name / tag fields (already implied by ADR-0003; making it explicit).
- One small win to fold into Slice 2:
  - Discriminator-stability test for `AgentProfile`. Pattern from SATI's `test_compressed_attestation_discriminator_backward_compat`.
- One new pending ADR (ADR-0005, testing stack — LiteSVM vs `solana-test-validator`). Defer drafting until just before Slice 1.

## License & attribution

SATI is Apache-2.0. We can study, reference, and adopt patterns freely. **We will not paste their code.** If a function in our codebase is heavily inspired by a specific SATI function, the commit message says so (e.g., "Pattern from cascade-protocol/sati programs/sati/src/instructions/registry/register_agent.rs phase-comment").
