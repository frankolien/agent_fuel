# ADR-0005: Hybrid testing stack — LiteSVM for unit / slice tests, `solana-test-validator` for integration

## Status

**Accepted** (2026-05-26). Effective Phase 1 Slice 1 onward.

## Context

Our build algorithm (`docs/algorithm.md`) requires that every slice's error branches are tested before the slice is considered shipped. With 6+ slices in Phase 1 and 12+ in Phase 2 — each adding multiple instructions and many error branches — the **per-test latency** of the chosen test runner directly determines how fast we can ship.

Three runners are realistically available in 2026:

1. **`solana-test-validator`** — full local Solana node spawned as a subprocess. ~5–10 s startup overhead per test session. Highest fidelity to a real cluster. The PRD's default.
2. **LiteSVM (`litesvm = "0.7"`)** — in-process Solana VM (no subprocess, no network). Sub-millisecond per-transaction overhead. Used by SATI (`programs/sati/Cargo.toml` confirms this), recommended by the Solana Foundation's official Claude Code skill (`.agents/skills/solana-dev/references/testing.md`).
3. **Mollusk (`mollusk-svm = "0.5"`)** — even lower-level than LiteSVM; harness for a single program's instruction handler. Lightest weight, but limited cross-program testing.

The PRD names `solana-test-validator` only. SATI's source has shown the ecosystem has moved beyond it for fast-loop test work.

## Decision

Adopt a **hybrid testing stack**:

- **LiteSVM** is the default for everything inside `programs/*/tests/` and `#[cfg(test)] mod tests` blocks within program crates. Every slice's happy path and every error branch is tested with LiteSVM. `cargo test --all` exercises this path.
- **`solana-test-validator`** is the runner for end-to-end integration tests living in the repo-root `tests/` directory (Anchor's default convention). These are written in TypeScript and run via `anchor test`. They exercise cross-program flows and on-chain state transitions across multiple transactions, with full Solana semantics.
- **Mollusk** is not adopted in v1. LiteSVM covers Mollusk's use cases for us; adding a third runner is unnecessary surface area.

### Boundaries

- **In a LiteSVM test**: single-program logic, instruction handler outcomes, account state invariants, error branches.
- **In an Anchor integration test**: multi-program interactions (e.g., Credit Vault spending into a service that holds a Reputation `AgentProfile`), CPI flows to SPL Token Program with a real USDC mint mock, real transaction signing flows.
- **Devnet smoke tests**: a small number of manual `anchor deploy` + `anchor migrate` scripted runs at the end of each phase. Not part of the per-PR CI loop.

## Consequences

**Pro:**

- Sub-second feedback loop on slice work. A typical TDD cycle goes from ~10 s (test-validator startup) to ~100 ms. Compounding across hundreds of test runs per slice, this saves days over Phase 1's lifespan.
- Aligns with the ecosystem direction. SATI, the Foundation skill, and the modern Anchor docs all lead with LiteSVM.
- Anchor integration tests still catch the "did our slice survive real Solana semantics" question that LiteSVM can't. We don't lose fidelity, we just put the slower path behind a less-frequent gate.

**Con:**

- We now maintain two test stacks. Mitigated by clear boundaries (above) and by the fact that LiteSVM is the *only* runner inside program crates — Anchor tests are a separate directory.
- LiteSVM is a younger crate than `solana-test-validator`. We accept that risk; it's used in production by SATI and others.
- Slightly more CI complexity — both runners need to be exercised. The CI workflow has two jobs (`rust` and `anchor`) already.

**Knock-on changes** (none destructive — these were planned anyway):

- `programs/*/Cargo.toml` will gain `[dev-dependencies] litesvm = "0.7"` when the first program test is written (Phase 1 Slice 2). Not added preemptively in Slice 1 because we have no tests to run yet, and unused dev-deps would fail `cargo udeps`.
- `tests/` at the repo root remains empty until we have a multi-program flow to exercise — likely Phase 2 Slice 3 (the first `spend` instruction's happy-path integration test).

## Alternatives considered

- **`solana-test-validator` only (PRD default).** Rejected: the per-cycle latency is multiplicative across hundreds of test runs. We'd ship slower for no fidelity gain on slice-level work.
- **LiteSVM only.** Rejected: we'd lose multi-program integration coverage. Devnet would be the first place we'd discover cross-program issues, and that's too late.
- **Mollusk for unit tests.** Considered. LiteSVM is strictly more capable (cross-program calls within a single test) and the ergonomics are closer to `solana-program-test`. Mollusk would be valuable if we needed CU benchmarks; we can add `mollusk-svm-bencher` as a `[dev-dependencies]` per-crate later if compute-unit budgets become a concern.
- **`solana-program-test`.** The Solana SDK's built-in async test harness. Older, slower, less ergonomic than LiteSVM. SATI moved off it; we shouldn't move onto it.

## References

- LiteSVM: https://github.com/LiteSVM/litesvm
- SATI's `programs/sati/Cargo.toml` (see `[dev-dependencies]`): documented in [`../sati-reference.md`](../sati-reference.md).
- Foundation skill testing reference: `.agents/skills/solana-dev/references/testing.md` (installed locally).
- `docs/algorithm.md` §4 — "A slice is not 'done on-chain' until every error in the spec has a test that triggers it."
