# Changelog

All notable changes to `agent-fuel-sdk` (Python) are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this package follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] — 2026-06-05

Slice 3 of 4 — live event subscriptions + the x402 fetch wrapper. The SDK now covers the same surface as `@agent-fuel/sdk@0.3.x` apart from the CLI.

### Added

- `fuel.on_event(callback, agent=?, on_status=?)` — async WebSocket subscription to the backend's `/ws/agents/<pubkey>` channel. Callback can be sync or async; `on_status` fires on every `connecting → open → reconnecting → closed` transition. Returns a `Subscription` whose `await sub.close()` tears the socket down cleanly. Reconnects on transient drops with exponential backoff capped at 30s.
- `fuel.on_service_event(service, callback, on_status=?)` and `fuel.on_vault_event(vault, callback, on_status=?)` — entity-scoped variants for callers that don't have an agent keypair (e.g. a service-side recorder).
- Low-level `subscribe(url, on_frame, on_status)` + `ws_url(api_base, path)` + `channel_url(api_base, channel, pubkey)` helpers for callers that want to build the URL themselves.
- `fuel.spend(recipient=..., amount_usdc=..., owner=?)` — standalone vault burn without recording a reputation event. Use this when paying x402 servers that aren't registered as Services; reuses the same six-check guardrail and on-chain error mapping as `pay()`. The earlier `spend_ix(...)` builder remains for callers that compose their own transactions.
- `fuel.payment_required(on_payment_required=?, on_paid=?, http_client=?)` — fetch-shaped HTTP wrapper that auto-pays on 402. Parses both the SDK-native (`recipient` / `amount_usdc` / `amountUsdc`) and x402-spec (`payTo` / `maxAmountRequired`) field names. The retry is single-attempt — a second 402 propagates to the caller so a misbehaving server can't drain the vault in a loop. Defaults to the shared `httpx.AsyncClient` the client already holds.
- `PaymentRequirement`, `PaymentRequiredFetcher`, `PaymentParseError`, `LiveEventFrame`, `LiveStatus`, `Subscription`, `SpendResult` — new public types.

### Notes

- The WebSocket implementation uses the `websockets` library already pinned in `pyproject.toml` (added in 0.1.0 for this slice). Ping/pong keepalives are handled by the library; the SDK forwards parsed event frames only.
- Mirrors `clients/sdk/src/live.ts` and `clients/sdk/src/x402.ts` line-for-line where the languages allow — same field names, same status state machine, same single-retry rule. Cross-language users move between TS and Python with no surface remapping.

## [0.2.0] — 2026-06-03

Slice 2 of 4 — action methods. The SDK is now write-capable.

### Added

- `fuel.pay({ service, amount_usdc, receipt_hash, owner? })` — atomic `spend` + `record_payment` + `compute_score` in one transaction. Service keypair co-signs the reputation half; the bundled `compute_score` is the same fix shipped in `@agent-fuel/sdk@0.3.2`, so the on-chain agent_profile.score advances with every payment instead of sitting stale at 0. Pre-flight runs the local six-check guardrail (frozen / zero / whitelist / per-tx / hourly / lifetime); on-chain `VaultError` codes 6001–6006 map back to the same typed `SpendPolicyError` subclasses so one `except SpendPolicyError` catches both. Also surfaces `ReceiptAlreadyRecordedError` and `ServiceInactiveError` from the reputation half.
- `fuel.request_spend({ service, amount_usdc, owner? })` — over-limit approval flow. Reads the vault's `pending_count` to derive the `PendingSpend` PDA, then returns `(signature, pending_spend, nonce)` so the bot can poll for the owner's verdict from the mobile app.
- `fuel.register_service({ sponsor, service, name, category, service_uri? })` — two-signer service registration. Sponsor pays rent + submits; service is the long-lived signing identity that co-signs every future `record_payment`.
- Standalone `pay()` / `request_spend()` / `register_service()` functions for callers that prefer functional shape over the client class.
- `guardrails.guard_spend(...)` — local mirror of the on-chain six-check ladder. Each per-tx / hourly / lifetime check is gated on `limit > 0`, matching the on-chain convention that a zero limit means "no enforcement" rather than "zero allowed" (caught in slice-2 verification — the Python port initially rejected every spend on an unlimited policy). Public so callers can pre-flight without spending a tx slot.
- `instructions` module — hand-rolled Anchor instruction builders (`spend_ix`, `record_payment_ix`, `compute_score_ix`, `request_spend_ix`, `register_service_ix`, plus the SPL idempotent-ATA-create instruction). Discriminators are computed at runtime via `anchor_discriminator(name)` so a new on-chain instruction needs no constant-table update.
- `rpc` module — `get_latest_blockhash`, `send_transaction`, `confirm_signature`, `send_and_confirm`. Pure JSON-RPC over `httpx`, no extra connection pools — every helper reuses the `httpx.AsyncClient` the `AgentFuel` client already holds.
- `anchor_errors.map_pay_error` / `map_spend_error` — RPC simulation strings → typed exception rewrites so callers branch on type, not text.

### Notes

- Verified end-to-end on devnet against the same `Cowi… / 5ro8…` vault used to verify slice 1.
- `compute_score` bundling carries over the lesson from the score-pipeline incident — see `project_score_pipeline.md` for the full incident.

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
