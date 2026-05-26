# The Build Algorithm

> Status: **draft v0.1** — this is the proposed process. Open to changes before we commit.

The PRD is large. To avoid drowning, we follow a fixed recipe for every feature we build. The recipe is the same whether the feature is `initialize_agent`, the score engine, the Flutter vault editor, or anything else.

## Core principle

**On-chain is the source of truth. Design top-down from there.**

Every feature has a chain of derivations:

```
PDA layout & instruction signature   ← we design this first
        ↓
On-chain handler & error enum         ← Anchor code
        ↓
Emitted event                         ← what the indexer sees
        ↓
Postgres row / Redis cache entry      ← backend state
        ↓
REST or WebSocket payload             ← API surface
        ↓
Client UI / SDK function              ← user-visible behaviour
```

If we get the top of the chain wrong, every layer below has to be redone. So we spend disproportionate time at the top.

## Code & commit standard

The bar for everything in this repo is **senior engineer with 25+ years of experience**. Our commits are reviewed externally, not just by us, so the git history is part of the deliverable.

### Code

- **Tight and intentional.** No dead code, no speculative abstractions, no parameters or traits added because "we might need it." Three similar lines beats a premature helper.
- **Idiomatic Rust.** `Result` everywhere user input or chain state is involved. No `.unwrap()` outside tests. No `.clone()` used to dodge the borrow checker. Anchor code uses framework macros, not hand-rolled equivalents.
- **Domain modeling does the work.** Make illegal states unrepresentable in the type system. An account that can't logically be uninitialised shouldn't have an `is_initialised: bool` field — its existence as a PDA is the proof.
- **Errors handled at their layer.** Don't propagate raw chain errors to the client. Don't defensively guard for conditions the type system already rules out.
- **Comments are rare.** They explain *why* — a constraint, a workaround, an invariant a future reader would miss. Never *what*. If a comment restates a function name, delete the comment or rename the function.
- **Read before writing.** Match existing patterns in the repo before inventing new ones. If we are deliberately changing a pattern, that change goes in an ADR.

### Commits

- **Never commit without an explicit "commit this" from the user.** Working tree changes accumulate locally; we ship them when asked.
- **One logical change per commit.** Feature + refactor in the same commit is a smell. Split it.
- **Atomic and revertable.** Every commit on the branch should leave the project compiling and the relevant tests passing.
- **Messages explain the *why*.** The diff already shows the *what*. Imperative mood, ~70-char subject, body for non-trivial context.
- **No noise commits** in the history we hand over — no `wip`, no `fix typo`, no `address review`. Clean up locally (squash, amend) before asking to commit.
- **No skipping hooks** (`--no-verify`). If a hook fails, fix the cause.
- **No committing** generated files, debug prints, commented-out code, or stub `TODO` placeholders meant for "later."

## The unit of work: a feature slice

A **slice** is one capability built end-to-end through every layer above. Examples:

- "An owner can create an AgentProfile for their agent wallet."
- "An owner can deposit USDC into a vault."
- "A service can read an agent's reputation score."

A slice is *not* "the reputation program" or "the backend." Those are too large to validate.

## The recipe (per slice)

### 1. Specify — paper before code

Open `data-model.md`. Add or update:

- **PDA(s) touched** — name, seeds, fields (with types + byte sizes), total account size.
- **Instruction signature** — name, signers, accounts (with `mut`/`signer` flags), args, return.
- **Errors** — every reason this instruction can fail, with a stable error code.
- **Event** — what gets emitted on success, with all fields.

If any of these aren't obvious yet, the slice isn't ready to build. Stop and think.

### 2. Walk the flows

Before writing Rust, trace the slice through every real user flow that touches it:

- Happy path: what does the chain look like before and after?
- Every error branch: which check catches it? Is the order right?
- Adversarial: can a compromised agent key abuse this? Can a malicious service?
- Concurrency: what if two instructions race?

If a flow exposes a hole in the design, fix the spec in `data-model.md`. Then re-walk.

### 3. Implement on-chain

Anchor code:

- Account structs with `#[account]` and discriminator.
- Instruction handler with `#[derive(Accounts)]` context.
- Error enum entries.
- `emit!` the event.

The code should be a near-mechanical translation of `data-model.md`. If you're inventing structure here, you skipped step 1.

### 4. Test on-chain

On `solana-test-validator`, write tests covering:

- Happy path.
- **Every** error branch from the spec.
- Every constraint check in `spend` order (frozen → whitelist → per-tx → hourly → ceiling).
- Edge cases: zero amounts, max u64, hour-window boundary, empty whitelist.

A slice is not "done on-chain" until every error in the spec has a test that triggers it.

### 5. Index off-chain

In the Actix-Web backend:

- Add the event parser for the new event type.
- Add the Postgres write (use a migration; never mutate schema ad-hoc).
- Invalidate any Redis cache entries the event affects.
- Push to WebSocket subscribers if it's an event a client cares about.

### 6. Expose via API

Only if the slice has a user-facing surface in the current phase:

- REST endpoint (with SIWS auth if owner-facing, rate-limited if service-facing).
- WebSocket event type.

### 7. Client surface

Only the surfaces the current phase actually needs. We don't build the Flutter screen for a feature in Phase 1 if Phase 1 only requires the React dashboard.

### 8. Integration test

A scripted end-to-end run: a real agent key, a real vault, a real spend, observed in the indexer, surfaced via the API, displayed in the client. If this doesn't pass, the slice isn't shipped.

### 9. Record the decision (if non-obvious)

If we made a judgement call — picked an account size, chose a check ordering, deferred a feature — drop a short ADR in `docs/decisions/`. Format: title, context, decision, consequences. Half a page max.

## Sequencing rule

**Vertical slices before horizontal completeness.** We finish one capability through every layer before starting the next. The dashboard does not need to be "complete" before we add a second instruction — but `initialize_agent` should be visible in the dashboard before we start on `register_service`.

## When to stop and replan

Pause the current slice and update the spec (and write an ADR) if any of these happen:

- A slice forces a PDA layout change on an already-shipped slice.
- A new error type makes an existing check ordering wrong.
- An event field needs to be added — does it break the existing indexer?
- Performance reality differs from the PRD's assumptions (e.g. hour window math).

Cheaper to replan than to ship a contradiction.

## What this algorithm explicitly rejects

- **Big-bang design docs.** `data-model.md` grows one slice at a time.
- **Backend-first or client-first work.** They derive from chain; building them first means inventing structure that won't match.
- **Speculative abstractions.** No traits, no generics, no "future-proofing" until a second concrete use case exists.
- **Skipping the error tests.** The whole product is "reject bad spends" — untested rejection paths are the actual deliverable missing.

## Open questions about the algorithm itself

These are the meta-decisions about *how we work*, not what we build. Worth resolving before we start Phase 1:

1. **Where do slice specs live?** One growing `data-model.md`, or one file per instruction under `docs/instructions/`? (Default: one file, until it gets unwieldy.)
2. **Do we ship to Devnet per slice, or per phase?** Per-slice gives faster real-world feedback; per-phase is less ceremony. (Default: per phase, with local validator per slice.)
3. **Tests in Rust or TypeScript?** Anchor supports both. Rust tests are faster but TS tests double as SDK reference code. (Default: TS, since the SDK needs the same flows anyway.)
4. **ADRs — when is a decision "non-obvious enough" to record?** Subjective. (Default: if you'd ask "wait, why did we do it this way?" three weeks later, write the ADR.)
