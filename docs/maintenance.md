# Maintenance Standard

> Agent Fuel is funded by a **Solana Foundation grant**. Grant evaluators (experienced Solana engineers) can read the repo, the commit history, the CI runs, and the docs at any time. This file is the operational standard for keeping the project at grant-grade quality from day one.
>
> If you're about to commit something and you're not sure it meets this bar, the answer is "don't commit yet."

## 1. Repository hygiene — files that must exist at root from Slice 1

| File | Purpose |
| --- | --- |
| `README.md` | What the project is, why it exists, how to build and run. The first thing anyone reads. |
| `LICENSE` | Apache-2.0. Matches the Solana ecosystem norm (SATI, solana-dev-skill, Light Protocol). |
| `SECURITY.md` | Vulnerability disclosure policy. Email + GPG key + response SLA. |
| `CONTRIBUTING.md` | Even for a solo project — signals process maturity. Covers branch model, commit format, PR flow. |
| `CHANGELOG.md` | "Keep a Changelog" format. Updated per release. |
| `.editorconfig` | Editor-agnostic formatting baseline. |
| `rust-toolchain.toml` | Pinned Rust version. Reproducible builds. |
| `Anchor.toml` | Anchor workspace config, with `[programs.localnet]` / `[programs.devnet]` / `[programs.mainnet]` and the same program IDs across clusters. |
| `.gitignore` | Comprehensive — `target/`, `.anchor/`, `.agents/`, `*.so`, `node_modules/`, etc. |
| `.github/workflows/ci.yml` | CI gates (see §5). Every push runs this. |
| `.github/PULL_REQUEST_TEMPLATE.md` | Standard PR body — what, why, ADR ref, test plan. |

## 2. Commit discipline — Conventional Commits, scoped

**Format:**

```
<type>(<scope>): <imperative subject under 70 chars>

<body explaining the why, motivation, and what users see change.
Reference the ADR or spec section that authorized this change.
Wrap at 72 chars.>

<footer with breaking-change notices, issue refs, or co-authored-by lines>
```

**Allowed types:**

| Type | When to use |
| --- | --- |
| `feat` | New user-visible feature or instruction |
| `fix` | Bug fix (must reference how the bug was reproduced + how the fix prevents it) |
| `docs` | Documentation only (this file, ADRs, READMEs) |
| `refactor` | Code change that's neither feature nor fix — restructuring with no behaviour change |
| `test` | Adding or improving tests, no production-code change |
| `perf` | Performance improvement with measurement in the body |
| `chore` | Tooling, build config, dependency bumps |
| `ci` | CI workflow changes |
| `build` | Anchor.toml, Cargo.toml structural changes (not dep bumps — those are `chore`) |
| `security` | Security-impact change (always pair with a SECURITY.md update if disclosure-related) |

**Allowed scopes** (workspace crates / domains):

`reputation`, `vault`, `backend`, `sdk`, `dashboard`, `mobile`, `docs`, `workspace`.

**Examples:**

```
feat(reputation): add AgentProfile PDA with ERC-8004 discoverability fields

Implements Phase 1 Slice 2. AgentProfile now carries agent_uri ([u8; 128])
and external_agent_id (u64) per ADR-0003. The agent_uri points to an
off-chain ERC-8004 registration JSON; external_agent_id holds the EVM
agent ID for cross-ecosystem identity.

Account size: 384 bytes (256 PRD + 144 ADR-0003 fields).
Includes a discriminator-stability test pinning SHA256("AgentProfile")[0..8].

Refs: docs/decisions/0003-erc-8004-compatibility.md
```

```
fix(vault): reject spend instructions when whitelist_count is 0 but whitelist is non-empty

Repro: create_vault followed by update_policy with whitelist=[X, X, X]
without setting whitelist_count caused all spends to pass the whitelist
check (count=0 implied "no whitelist"). Fix tightens the invariant: if
any whitelist slot is non-default, whitelist_count must match.

Added regression test reproducing the original repro at
programs/credit-vault/tests/whitelist_invariant.rs.
```

**Anti-patterns** (will never appear in main):

- `wip`, `fix typo`, `address review`, `more changes`, `update`, `final`
- Feature + refactor + style in one commit
- Empty bodies on `feat`/`fix` — the body is the per-feature documentation
- `--no-verify` to skip pre-commit hooks

## 3. PR discipline — even solo

Every change lands via PR, not direct push to `main`. Solo PRs are not theatre — they:

- Force a moment of self-review before merge.
- Trigger CI on a non-`main` branch, catching breakage before it pollutes history.
- Produce a permanent audit artifact a grant evaluator can read.

**PR template** (`.github/PULL_REQUEST_TEMPLATE.md`):

```markdown
## What
One-line summary of the change.

## Why
Motivation. Reference the ADR / phase slice / issue that authorized this work.

## How
2–4 bullets on the implementation approach. Note any deviations from the spec.

## Test plan
- [ ] `anchor build` clean
- [ ] `cargo test` green
- [ ] `cargo clippy -- -D warnings` clean
- [ ] `cargo fmt --check` clean
- [ ] Manual: [specific verification steps]

## Risk / blast radius
What breaks if this is wrong? Who is affected?
```

**Merge style:** squash-merge. One commit per PR on `main`. The squashed commit's message is the PR body's distilled form, following the Conventional Commits format from §2.

## 4. Code quality gates

### Always-on (every PR, blocking)

| Gate | Tool |
| --- | --- |
| Formatting | `cargo fmt --all --check` |
| Linting | `cargo clippy --all-targets -- -D warnings -W clippy::pedantic` |
| Tests | `cargo test --all` |
| Anchor builds | `anchor build` (both programs) |
| Anchor tests | `anchor test --skip-deploy` |
| Dependency audit | `cargo audit` (fails on known CVEs) |
| Unused deps | `cargo udeps` (catches `Cargo.toml` rot) |

### Per-release (additional, blocking before tagging)

| Gate | Tool |
| --- | --- |
| Doc build | `cargo doc --all --no-deps` (must produce no warnings) |
| Coverage | `cargo llvm-cov` (target: >= 80% line, >= 70% branch on programs) |
| License check | `cargo deny check licenses` (no GPL/AGPL deps unless approved) |
| SBOM | Generate `cargo cyclonedx` SBOM, attach to release |

### `#[allow(...)]` discipline

A `#[allow(clippy::some_lint)]` is acceptable when:

1. The lint is genuinely wrong for the context.
2. A one-line `// why:` comment immediately above explains why.
3. The scope is the smallest possible (single function or block, never crate-wide).

`#[allow]` without justification is treated as a lint failure.

## 5. CI workflow shape

Minimal `.github/workflows/ci.yml` from Slice 1:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  rust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy
      - run: cargo fmt --all --check
      - run: cargo clippy --all-targets -- -D warnings
      - run: cargo test --all
      - run: cargo install cargo-audit && cargo audit
  anchor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: # install Solana CLI, Anchor CLI (pinned versions)
      - run: anchor build
      - run: anchor test --skip-deploy
```

We refine this as the workspace grows — Slice 1's job is to make it exist and pass.

## 6. Documentation discipline

- **Every public API gets a `///` doc comment.** Private items only get comments when explaining a non-obvious invariant.
- **Every crate gets its own `README.md`** at `programs/<crate>/README.md`, `backend/README.md`, `sdk/README.md`.
- **ADRs in `docs/decisions/`** for every non-obvious design choice. We already have 0003 and 0004; new ones get sequential numbers.
- **`docs/data-model.md`** is updated *before* a slice writes code, not after.
- **`CHANGELOG.md`** is updated *as part of the PR that ships a user-visible change*, not in a separate sweep.

## 7. Security discipline

- `solana-security-txt::security_txt!` macro in both program `lib.rs` files. Contact: `security@<our-domain>`, link to `SECURITY.md`.
- `SECURITY.md` defines the disclosure policy: email + GPG key + 90-day disclosure window.
- `cargo audit` runs in CI; failures block merge.
- Dependency additions go through an ADR if the dep isn't already in [`dependencies.md`](dependencies.md).
- Pre-mainnet: full audit by a recognized firm (Phase 5).

## 8. Reproducibility

- `rust-toolchain.toml` pins the Rust version. Updating it is a `build` commit with reasoning.
- `Anchor.toml` pins the Anchor version. Same rule.
- `Cargo.lock` is committed for the workspace.
- The Solana CLI version is pinned in CI and documented in `CONTRIBUTING.md`.
- A `make build` (or equivalent script) produces identical bytes on Linux and macOS for the same inputs.

## 9. Versioning

- Semver: `MAJOR.MINOR.PATCH`. Pre-1.0 lives in `0.x.y` where `x` is the minor bump.
- Phase 1–4 → `0.1.0`–`0.4.0`. Mainnet deploy → `1.0.0`.
- Release tags follow `v<semver>`. Releases get a CHANGELOG entry and a GitHub Release with the binary artifacts (program `.so` files + IDLs).

## 10. First-90-days checklist (do during Slice 1)

- [ ] `README.md` written — punchy, accurate, links to docs/.
- [ ] `LICENSE` (Apache-2.0).
- [ ] `SECURITY.md` with disclosure policy.
- [ ] `CONTRIBUTING.md` referencing this file.
- [ ] `CHANGELOG.md` with an empty `[Unreleased]` section.
- [ ] `.editorconfig`.
- [ ] `rust-toolchain.toml` pinned.
- [ ] `.gitignore` expanded (target/, .anchor/, .agents/, node_modules/, *.so, etc.).
- [ ] `.github/workflows/ci.yml` runs the §5 gates.
- [ ] `.github/PULL_REQUEST_TEMPLATE.md` matches §3.
- [ ] Anchor workspace scaffold with both program crates.
- [ ] `solana-security-txt!` block in both `lib.rs` files.
- [ ] First commit on the new history follows §2 format.
- [ ] CI green on first push.

When this checklist is complete and CI is green, Slice 1 is done. Then we start Slice 2.
