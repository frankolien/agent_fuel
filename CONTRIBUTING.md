# Contributing to Agent Fuel

Thanks for your interest in Agent Fuel. Agent Fuel is funded by a Solana Foundation grant, and the repository is maintained to a high standard. The rules below exist so that every contribution slots cleanly into a clean, auditable history.

## Before you start

1. Read [`README.md`](README.md) for project context.
2. If you are proposing a new feature, open a discussion or issue first. Significant changes go through an ADR (architecture decision record) before code is written.
3. Make sure you can run `anchor build` and `cargo test --all` locally before opening a pull request.

## Branch model

- `main` — always green. Protected. Only landed via squash-merged pull requests.
- Topic branches — `<type>/<short-slug>`, e.g. `feat/reputation-initialize-agent`, `fix/vault-whitelist-invariant`. One topic per branch.

## Commit messages — Conventional Commits, scoped

```
<type>(<scope>): <imperative subject under 70 chars>

<body explaining the why, motivation, and what users see change.
Reference the spec section or design decision that authorized this change.
Wrap at 72 chars.>

<footer with breaking-change notices, issue refs, or co-authored-by lines>
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `chore`, `ci`, `build`, `security`.

**Scopes:** `reputation`, `vault`, `backend`, `sdk`, `dashboard`, `mobile`, `docs`, `workspace`.

**Examples:**

```
feat(reputation): add AgentProfile PDA with ERC-8004 fields

Implements the agent profile primitive. AgentProfile carries the ERC-8004
discoverability fields (agent_uri, external_agent_id) and the payment
counters that feed the reputation score.

Account size: 384 bytes. Includes a discriminator-stability test.
```

```
fix(vault): reject spend instructions when whitelist contains stale entries

Repro: create_vault followed by update_policy with whitelist=[X, X, X]
without setting whitelist_count caused all spends to pass the whitelist
check. Fix tightens the invariant: any non-default slot must match
whitelist_count.
```

Anti-patterns rejected at review: `wip`, `fix typo`, `address review`, mixed feature + refactor in one commit, empty body on `feat` / `fix`, `--no-verify`.

## Pull requests

Every change lands via PR. Solo PRs are encouraged for the audit-trail value. The PR template (`.github/PULL_REQUEST_TEMPLATE.md`) walks you through what we expect.

- One logical change per PR.
- Squash-merged to `main` — one commit on history per PR.
- CI must pass before merge.

## Code quality gates

CI runs on every push:

- `cargo fmt --all --check`
- `cargo clippy --all-targets -- -D warnings`
- `cargo test --all`
- `anchor build` (both programs)
- `cargo audit` (no known CVEs)

`#[allow(...)]` requires a `// why:` comment justifying the suppression, scoped as narrowly as possible.

## Doc comments

Every `pub` item gets a `///` doc comment that reads cleanly under `cargo doc`. Private items get comments only when explaining a non-obvious invariant. Code that needs a comment to explain *what* it does should be rewritten until it doesn't.

## Toolchain

Reproducible builds are non-negotiable. Versions are pinned:

- Rust — `rust-toolchain.toml`
- Anchor — `Anchor.toml`
- Solana CLI — documented here and in CI: **3.1.x**
- `pnpm` — declared in `package.json` once we add one

Bumping any of these is its own PR with a `build:` or `chore:` commit and a CHANGELOG entry.

## Security

If you find something that looks like a security defect, follow [`SECURITY.md`](SECURITY.md) — do not file a public issue.

## License of contributions

By contributing, you agree that your contributions are licensed under Apache-2.0 (the project license).
