# Changelog

All notable changes to Agent Fuel are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Pre-`1.0.0`, breaking changes may land in minor bumps; from `1.0.0` onward, semver is strict.

## [Unreleased]

### Added

- **Reputation program — `record_payment` instruction + `AgentServiceLink` and `ReceiptUsed` PDAs.** Service-signed instruction that records an x402 payment. Bumps `total_transactions`, `total_volume_usdc`, `consecutive_success`, and `last_active_slot` on `AgentProfile`; bumps `total_volume_received_usdc` and `last_active_slot` on `ServiceRegistry`. `AgentServiceLink` is a per-pair marker (169-byte PDA seeded `["link", agent_profile, service_registry]`, created via `init_if_needed`) that ensures `services_used` and `total_agents_served` increment exactly once per unique `(agent, service)` pair. `ReceiptUsed` is a per-receipt-hash marker (113-byte PDA seeded `["receipt", payment_receipt_hash]`, created via `init`) that enforces single-use of every payment receipt hash globally across the program — replay of the same hash, including across different pairs, fails with `AccountAlreadyInUse`. Service-signed instead of backend-signed in v1 — the service is the natural attester of the off-chain x402 settlement; a backend co-signer can layer on later without a schema break. Signer-to-registry binding is enforced through the PDA seed (`["service", service.key()]`) rather than a `has_one`, so an attacker signing with their own key cannot drive someone else's registry. All counter mutations use `checked_add` and surface as `ReputationError::Overflow` (code 6000). Other new errors: `ServiceInactive` (6001), `ZeroAmount` (6002). Emits `PaymentRecorded` carrying the payment receipt hash for off-chain audit. LiteSVM tests cover happy path, repeat-pair no-double-bump, distinct-services bump, zero-amount rejection, missing-signature rejection, wrong-signer rejection, receipt-replay rejection, and cross-pair receipt-collision rejection.
- **`anchor-lang/init-if-needed` feature** enabled on the reputation crate. Required by `AgentServiceLink`'s lazy init; the link's read-after-init paths are guarded by a `Pubkey::default()` sentinel so the init-if-needed footgun (passing a pre-existing account) doesn't apply.
- **Reputation program — `ServiceRegistry` PDA and `register_service` instruction.** Per-service registration with `name: [u8; 32]`, `category: ServiceCategory` (`DataFeed` / `Compute` / `Swap` / `Rpc` / `Other`), an `active` soft-delete flag, and running totals. 171-byte account. Single-signature (no dual-sig analog needed — a service has no separate human owner; the wallet *is* the service). LiteSVM tests cover happy path, re-register rejection, missing-signature rejection, and distinct-pubkeys-get-distinct-PDAs.
- **Reputation program — `AgentProfile` PDA and `initialize_agent` instruction.** First on-chain primitive. The PDA carries the ERC-8004 discoverability fields (`agent_uri`, `external_agent_id`) per ADR-0003 and the feedback-counter shape (`total_feedback_count`, `active_negative_feedback_count`) per ADR-0004. Total account size: 321 bytes. `initialize_agent` requires dual signature (owner + agent) to close a squatting vector.
- LiteSVM-based integration tests for `initialize_agent`: happy path (full field assertions), re-init rejection, missing owner signature rejection, missing agent signature rejection.
- Discriminator-stability and account-size unit tests for `AgentProfile`. Pinning the 8-byte discriminator catches accidental struct renames that would break deserialization of deployed accounts.
- `litesvm = "0.7"`, `solana-sdk = "2.2"`, `sha2 = "0.10"` declared as workspace dev-dependencies.
- Anchor workspace scaffold with two empty program crates (`reputation`, `credit_vault`).
- `solana-security-txt` embedded in both program binaries; placeholder security contact pending project domain.
- Repo hygiene baseline — `README.md`, `LICENSE` (Apache-2.0), `SECURITY.md`, `CONTRIBUTING.md`, `.editorconfig`, `.gitignore`, `rust-toolchain.toml` (pinned to 1.89.0).
- CI workflow at `.github/workflows/ci.yml` runs `cargo fmt`, `clippy -D warnings`, `anchor build`, `cargo test`, and `cargo audit` in a single job (the previous split between `rust` and `anchor` jobs prevented LiteSVM tests from reaching the compiled `.so`).
- Pull request template at `.github/PULL_REQUEST_TEMPLATE.md`.
- Workspace-level `unexpected_cfgs` allow-list covering Solana's standard `cfg(target_os = "solana")` and Anchor's optional feature flags.
- Testing stack decision (ADR-0005): LiteSVM for unit / slice tests inside program crates, `solana-test-validator` for cross-program integration tests via `anchor test`.
- `.vscode/settings.json` routes VSCode's rust-analyzer through the project's pinned Rust toolchain (`RUSTUP_TOOLCHAIN=1.85.0`) and configures inline diagnostics to match the CI clippy gate. `.vscode/extensions.json` recommends rust-analyzer, even-better-toml, codelldb, and editorconfig.

### Known placeholders

These exist as `TODO` markers and must be replaced before any public release:

- Repository URL across `Cargo.toml`, both program `lib.rs` `security_txt!` blocks, and `LICENSE` copyright line. (Pending GitHub remote.)
- Security contact email — currently `security@agentfuel.dev`, replaced once the project domain is provisioned.
- Program IDs — currently non-vanity (`4GjB4xdm…`, `EsykPsa…`). Replaced with grind-vanity IDs (e.g. `agentf…`, `fuel…`) before mainnet deployment.
