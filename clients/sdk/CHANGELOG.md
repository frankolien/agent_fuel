# Changelog

All notable changes to `@agent-fuel/sdk` are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this package follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
