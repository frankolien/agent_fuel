# Changelog

All notable changes to Agent Fuel are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Pre-`1.0.0`, breaking changes may land in minor bumps; from `1.0.0` onward, semver is strict.

## [Unreleased]

### Added

- Anchor workspace scaffold with two empty program crates (`reputation`, `credit_vault`).
- `solana-security-txt` embedded in both program binaries; placeholder security contact pending project domain.
- Repo hygiene baseline — `README.md`, `LICENSE` (Apache-2.0), `SECURITY.md`, `CONTRIBUTING.md`, `.editorconfig`, `.gitignore`, `rust-toolchain.toml` (pinned to 1.85.0).
- CI workflow at `.github/workflows/ci.yml` running `cargo fmt`, `clippy -D warnings`, `cargo test`, `anchor build`, and `cargo audit` on every push.
- Pull request template at `.github/PULL_REQUEST_TEMPLATE.md`.
- Workspace-level `unexpected_cfgs` allow-list covering Solana's standard `cfg(target_os = "solana")` and Anchor's optional feature flags.
- Testing stack decision (ADR-0005): LiteSVM for unit / slice tests inside program crates, `solana-test-validator` for cross-program integration tests via `anchor test`.
- `.vscode/settings.json` routes VSCode's rust-analyzer through the project's pinned Rust toolchain (`RUSTUP_TOOLCHAIN=1.85.0`) and configures inline diagnostics to match the CI clippy gate. `.vscode/extensions.json` recommends rust-analyzer, even-better-toml, codelldb, and editorconfig.

### Known placeholders

These exist as `TODO` markers and must be replaced before any public release:

- Repository URL across `Cargo.toml`, both program `lib.rs` `security_txt!` blocks, and `LICENSE` copyright line. (Pending GitHub remote.)
- Security contact email — currently `security@agentfuel.dev`, replaced once the project domain is provisioned.
- Program IDs — currently non-vanity (`4GjB4xdm…`, `EsykPsa…`). Replaced with grind-vanity IDs (e.g. `agentf…`, `fuel…`) before mainnet deployment.
