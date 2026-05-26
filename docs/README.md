# Agent Fuel — Planning Docs

This folder is where we plan everything before we build it. The PRD (`Agent_Fuel_PRD.pdf` in the repo root) says **what** we're building. These docs say **how** we build it, **in what order**, and **why** we made each call.

## Contents

| File | Purpose |
| --- | --- |
| [`algorithm.md`](algorithm.md) | The repeatable process we follow for every feature, from idea to shipped slice. Read this first. |
| [`scope.md`](scope.md) | One-page distillation of the PRD — what we're building, restated in our own words so we never have to reread 23 pages. |
| [`data-model.md`](data-model.md) | Canonical spec of every PDA, instruction, error, and event. Updated **before** we write code, not after. |
| [`phases.md`](phases.md) | The 5 PRD phases broken into feature slices. The actual build order. |
| [`competitive-landscape.md`](competitive-landscape.md) | What already exists in this problem space (SAID, SATI, OpenDexter) and what's actually our moat. Surfaces design choices we should revisit. |
| [`sati-reference.md`](sati-reference.md) | Detailed comparison of SATI's actual program source vs our planned design. Proves we don't duplicate. Lists 7 patterns to adopt + 5 to deliberately avoid. |
| [`decisions/`](decisions/) | ADR-style log: one short file per non-obvious decision. |
| [`maintenance.md`](maintenance.md) | Grant-grade repo standards — Conventional Commits, CI gates, code quality, security, reproducibility. **Read before touching code.** |
| [`dependencies.md`](dependencies.md) | Every external service, account, API key, and library we depend on — what it's for, when we need it, what env vars it implies. |
| [`glossary.md`](glossary.md) | Terms we use a lot (PDA, vault, policy, post-pay, claim, etc.). Helps onboard and pins down meanings. |

## Rules

1. **No code is written until the relevant section of `data-model.md` is filled in.**
2. **No PDA layout, error, or event is changed without updating `data-model.md` first and noting the change in `decisions/`.**
3. **On-chain is the source of truth.** Backend, clients, and SDK derive from it. We never invent off-chain state that can't be reconstructed from chain events.
4. **One feature slice at a time, end-to-end.** Better to have `initialize_agent` working from Anchor → indexer → API → client than to have five half-built instructions.
