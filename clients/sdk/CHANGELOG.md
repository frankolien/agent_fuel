# Changelog

All notable changes to `@agent-fuel/sdk` are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this package follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] — 2026-05-31

### Changed

- CLI: replace the generic `account not found: <PDA>` with command-specific messages that name the missing resource and the inputs that produced the lookup. `agent-fuel vault Cowi… 5ro8…` now reports `no vault found at <PDA> for owner=Cowi… agent=5ro8… — has init_vault been called for this pair?` instead of dumping a raw PDA the user has no way to map back. Applies to `score`, `vault`, `policy`, `service`, and `pay`.

## [0.3.0] — 2026-05-31

### Added

- `agent-fuel` CLI binary. Same install (`npm i -g @agent-fuel/sdk` or `npx @agent-fuel/sdk …`), three command surfaces:
  - **Read** (no key) — `score <agent>`, `vault <owner> <agent>`, `policy <owner> <agent>`, `service <authority>`. Hit the live backend / on-chain account directly, no setup needed: `npx @agent-fuel/sdk vault <owner> <agent>` works out of the box.
  - **Action** (`--keypair`) — `pay`, `request-spend`, `register-service`. Same primitives as the JS surface, with keypairs loaded from `solana-keygen`-style JSON files.
  - **Dev** — `keygen [--out path]` (writes a fresh keypair; pubkey to stdout, secret to stderr so you can redirect), `--version`, `--help`.
- Global flags: `--cluster <name>` (default `devnet`), `--rpc <url>` override, `--api-base <url>` (default `https://api.agentfuel.online`), `--json` for machine-readable output piping into `jq`.

## [0.2.0] — 2026-05-31

### Added

- `pay({ agent, service, owner, amountUsdc, receiptHash, connection })` — atomic `spend` + `record_payment` in one tx, mirroring `Spender::pay()` in the Rust runtime. Vault burn and reputation accrual now land together or not at all; no half-states where USDC moved but the agent ↔ service link never updated.
- `requestSpend({ agent, owner, service, amountUsdc, connection })` — agent-initiated half of the over-limit approval flow. Returns the `pendingSpend` PDA so callers can poll for resolution.
- `registerService({ sponsor, service, name, category, serviceUri?, connection })` — register a new service on chain. Two-signer (sponsor pays rent, service is the long-lived identity).
- `pendingSpendPda(vault, nonce)` PDA helper.
- `PendingSpendAccount` type + decoder.
- Convenience wrappers on `AgentFuel`: `fuel.pay()`, `fuel.requestSpend()`, `fuel.registerService()` — same surface as the standalone functions, with the connection and agent supplied by the instance.

### Changed

- Re-vendored IDLs against the latest on-chain deploys so the SDK sees `request_spend`, `approve_spend`, `cancel_spend`, `register_service`, and the new `pending_count` field on `CreditVault`.
- `CreditVaultAccount` now includes `pending_count: number` — the nonce burned by the next `request_spend`.

## [0.1.1] — 2026-05-29

### Changed

- Moved `@coral-xyz/anchor` and `@solana/spl-token` from `peerDependencies` to `dependencies`. Host apps no longer need to provide compatible versions; the SDK ships its own and isolates from version skew (notably anchor 0.29 vs 0.31, which caused `BN.init` assertions when consumed from Solana Agent Kit).

## [0.1.0] — 2026-05-27

First public release. Six-method surface for AI agents to read reputation, pay services from a credit vault, and stream live events — plus an x402 fetch wrapper.

### Added

- `AgentFuel` class. Constructor: `{ agent: Keypair, owner?: Pubkeyish, cluster, rpc, apiBase? }`. Lazy-initializes Anchor `Program` instances on first chain read.
- `fuel.spend({ service, amountUsdc, owner? })` — pays a service from the agent's vault. Local six-check policy guardrail (frozen / zero / whitelist / per-tx / hourly window / lifetime) mirrors `programs/credit_vault/src/policy.rs`. On-chain `VaultError` codes map back to the same typed exceptions so a single `instanceof SpendPolicyError` catches both pre-flight and chain rejections. Prepends an idempotent ATA-create for the recipient so callers never need to pre-flight whether the service has a USDC account.
- Read methods, all returning snake_case-keyed structs that mirror the on-chain layouts and the backend's REST shapes:
  - `fuel.getScore(agent?)` — REST `/reputation/:agent`.
  - `fuel.getVaultBalance(ref?)` — Anchor account fetch on `CreditVault`, with a derived `balance` field.
  - `fuel.getPolicy(ref?)` — Anchor account fetch on `SpendPolicy`. Default-padding whitelist entries stripped.
  - `fuel.checkService(serviceAuthority)` — Anchor account fetch on `ServiceRegistry`, name decoded from UTF-8.
- `fuel.onEvent(callback, options?)` — WebSocket subscription per agent. Reconnect with exponential backoff (`1 → 2 → 4 … cap 30 s`); status flow `connecting → open → reconnecting → closed`. Isomorphic: prefers `globalThis.WebSocket`, falls back to `ws` on Node 18–21 via lazy import.
- `paymentRequired(fuel, options?)` — fetch-shaped wrapper for HTTP 402. Parses `X-Payment-Required` header (or 402 body), accepts both `recipient`/`amountUsdc` and `payTo`/`maxAmountRequired` vocabularies, fires `spend()`, retries once with `X-Payment: <signature>`. Single retry by design.
- Typed errors: `AgentFuelError` base, `AccountNotFoundError`, `HttpError`, `OwnerNotConfiguredError`, `PaymentParseError`, and `SpendPolicyError` with six concrete subclasses (`VaultFrozenError`, `ZeroAmountError`, `NotWhitelistedError`, `PerTxLimitExceededError`, `HourlyLimitExceededError`, `LifetimeLimitExceededError`).
- PDA helpers: `vaultPda(owner, agent)`, `policyPda(vault)`, `serviceRegistryPda(authority)`.
- SPL token helpers: `TOKEN_PROGRAM_ID`, `ASSOCIATED_TOKEN_PROGRAM_ID`, `getAssociatedTokenAddress`, `createAssociatedTokenAccountIdempotentInstruction`.
- IDLs vendored at [`src/idl/`](src/idl/) and re-exported as sub-paths (`@agent-fuel/sdk/idl/reputation`, `@agent-fuel/sdk/idl/credit-vault`).
- Runnable example at [`examples/x402-quickstart/`](examples/x402-quickstart/) with a dry-run mode (no Solana) and a devnet mode.

### Notes

- Published with npm provenance via GitHub Actions on tag push.
- Peer dependencies: `@coral-xyz/anchor ^0.31` and `@solana/web3.js ^1.95`.
- Node engines: `>=18.18`.
