# Changelog

All notable changes to `agent-fuel-sdk` (Python) are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this package follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-06-03

First release. Slice 1 of 4 in the Python port of the TypeScript SDK ([`@agent-fuel/sdk`](https://www.npmjs.com/package/@agent-fuel/sdk)) — read-only surface. Action methods, live events, and the x402 wrapper land in subsequent slices.

### Added

- `AgentFuel` async client. Constructor: `agent: Keypair`, `cluster`, optional `owner`, optional `rpc` / `api_base` / shared `httpx.AsyncClient`. Use as a context manager or call `await fuel.close()` to release the HTTP pool.
- `fuel.get_score(agent?)` — REST snapshot via `GET /reputation/:agent`. Backend 404 → `AccountNotFoundError`.
- `fuel.get_vault_balance(ref?)` — on-chain `CreditVault` PDA fetch, raw RPC `getAccountInfo` parsed via `construct` Borsh schema. Derived `balance` field mirrors the TS SDK and the on-chain `vaultBalance()` helper.
- `fuel.get_policy(ref?)` — on-chain `SpendPolicy` PDA fetch. Default-pubkey whitelist entries stripped.
- `fuel.check_service(authority)` — on-chain `ServiceRegistry` PDA fetch, name decoded from UTF-8.
- All seven PDA helpers: `vault_pda`, `policy_pda`, `agent_profile_pda`, `service_registry_pda`, `agent_service_link_pda`, `pending_spend_pda`, `receipt_used_pda`.
- Typed exceptions matching the TS SDK: `AgentFuelError` base, `AccountNotFoundError`, `HttpError`, `OwnerNotConfiguredError`, `SpendPolicyError` + six concrete subclasses (`VaultFrozenError`, `ZeroAmountError`, `NotWhitelistedError`, `PerTxLimitExceededError`, `HourlyLimitExceededError`, `LifetimeLimitExceededError`), `RecordPaymentError` + two subclasses (`ReceiptAlreadyRecordedError`, `ServiceInactiveError`). The `SpendPolicyError` hierarchy is reserved for the slice-2 action methods.
- Dataclasses (`@dataclass(frozen=True)`) mirroring the on-chain account layouts: `CreditVaultAccount`, `SpendPolicyAccount`, `ServiceRegistryAccount`, `AgentProfileAccount`, `PendingSpendAccount`, plus the REST-shape `ReputationLookup`.
- Hand-rolled Borsh schemas via [`construct`](https://construct.readthedocs.io/) — keeps the dependency surface tight (no `anchorpy`) and lets the SDK pin the Anchor account discriminators explicitly, so a layout drift fails loud instead of silently mis-decoding.
- IDLs vendored under `agent_fuel/idl/` and loaded at module init for program IDs.

### Notes

- The TypeScript SDK is the reference for the full surface today. The Python port mirrors its naming (snake_case for methods, same dataclass field names) so cross-language users move between the two without remapping.
- Tested against the live devnet deploy at `api.agentfuel.online`.
- Dependencies: `solders ≥ 0.21`, `httpx ≥ 0.27`, `websockets ≥ 12`, `construct ≥ 2.10`, `base58 ≥ 2.1`. Python ≥ 3.10.
