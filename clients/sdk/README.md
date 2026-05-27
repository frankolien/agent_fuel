# @agent-fuel/sdk

TypeScript SDK for [Agent Fuel](https://github.com/TODO/agent_fuel) — credit vault + reputation primitives for AI agents on Solana.

> **Status:** `0.1.0`. Full read/write/stream surface live, published to npm with provenance.

## The six functions

| Function | Returns | What it does |
| --- | --- | --- |
| `fuel.spend({ service, amountUsdc })` | `{ signature }` | Pays a service from the agent's vault. Local six-check policy guardrail, then a single signed transaction. Idempotently creates the service's USDC ATA if needed. |
| `fuel.getScore(agent?)` | `ReputationLookup` | Public reputation snapshot via REST. Score is `null` for unscored agents. |
| `fuel.getVaultBalance(ref?)` | `CreditVaultAccount` | On-chain credit vault state with a derived `balance` field. Defaults to the agent's own vault when `owner` was passed to the constructor. |
| `fuel.getPolicy(ref?)` | `SpendPolicyAccount` | On-chain spend policy: per-tx / hourly / lifetime caps, whitelist, freeze flag. |
| `fuel.checkService(serviceAuthority)` | `ServiceRegistryAccount` | Service registry lookup by the registering wallet's pubkey. |
| `fuel.onEvent(callback, options?)` | `Subscription` | WebSocket stream of events for an agent. Auto-reconnect with backoff. |

Plus one fetch wrapper for the x402 protocol — see [Paying with x402](#paying-with-x402) below.

## Install

```bash
npm install @agent-fuel/sdk @solana/web3.js @coral-xyz/anchor
```

`@solana/web3.js` and `@coral-xyz/anchor` are peer dependencies; pin them yourself so your bot and the SDK share the same RPC client.

## Usage

```ts
import { Keypair, PublicKey } from "@solana/web3.js";
import { AgentFuel } from "@agent-fuel/sdk";

const agent = Keypair.generate(); // load yours from a keystore

const fuel = new AgentFuel({
  agent,
  owner: new PublicKey("..."),      // the wallet that funded your vault
  cluster: "devnet",
  rpc: "https://api.devnet.solana.com",
  apiBase: "https://api.agentfuel.online", // your Agent Fuel backend
});
```

`owner` is optional. When you pass it, the agent-side methods (`getVaultBalance`, `getPolicy`, `spend`) default to your own vault — call them with no args. Pass `owner` per call only when inspecting someone else's vault. Calling a method that needs the owner without configuring one anywhere throws `OwnerNotConfiguredError`.

## Read methods

```ts
// Public reputation snapshot (REST, no auth). Omit the arg to read your own.
const score = await fuel.getScore();
const otherScore = await fuel.getScore(otherAgentPubkey);

// On-chain credit vault state. With `owner` set on the constructor, no args
// reads your own vault. Pass a ref to inspect someone else's.
const vault = await fuel.getVaultBalance();
console.log(vault.balance, vault.frozen);
const otherVault = await fuel.getVaultBalance({ owner: otherOwner, agent: otherAgent });

// Same shape for the policy.
const policy = await fuel.getPolicy();

// Service registry lookup by the service's authority pubkey.
const service = await fuel.checkService(serviceAuthorityPubkey);
```

All methods throw `AccountNotFoundError` when the target doesn't exist on-chain (or returns 404 from the backend), and `HttpError` for non-2xx REST responses. Field names mirror the on-chain layout in `snake_case` so they line up with the backend's REST responses.

## Paying a service

```ts
const { signature } = await fuel.spend({
  service: serviceAuthorityPubkey,
  amountUsdc: 250_000,              // micro-USDC (0.25 USDC)
});
```

`spend()` fetches the current vault + policy and applies the same six-check ladder the on-chain program enforces ([programs/credit_vault/src/policy.rs](../../programs/credit_vault/src/policy.rs#L11)) before submitting. Each policy failure surfaces as a typed error so the caller can branch on it without parsing strings:

| Error | When |
| --- | --- |
| `VaultFrozenError` | `vault.frozen === true` |
| `ZeroAmountError` | `amountUsdc <= 0` |
| `NotWhitelistedError` | Whitelist is set and `service` isn't in it |
| `PerTxLimitExceededError` | `amountUsdc > policy.per_tx_limit_usdc` |
| `HourlyLimitExceededError` | Rolling 9 000-slot window would exceed `policy.hourly_limit_usdc` |
| `LifetimeLimitExceededError` | `vault.total_spent + amountUsdc > policy.lifetime_limit_usdc` |

All six inherit from `SpendPolicyError` for a single catch-all. The same exceptions are thrown for chain-side failures too — if the on-chain `VaultError` lands between the pre-flight and the transaction (concurrent spend, window roll-over), the SDK maps the Anchor error code back to the matching typed error so your `try/catch` doesn't have to branch on where the rejection came from.

The service's USDC associated token account is created on-demand — the SDK prepends an idempotent ATA-create instruction before every `spend`, so callers don't need to pre-flight whether the service has ever received USDC. The agent pays the rent (~0.002 SOL).

## Live events

```ts
const sub = fuel.onEvent(
  (frame) => {
    // frame.event_name is one of: Spent, Claimed, ScoreComputed, Deposited, ...
    console.log(frame.event_name, frame.payload);
  },
  { onStatus: (s) => console.log("ws:", s) },
);

// later
sub.close();
```

`onEvent()` opens a WebSocket to `/ws/agents/:pk` on the configured `apiBase`, parses each JSON frame into a typed `LiveEventFrame`, and fires `callback` for every event the backend broadcasts for that agent. Connection status flows through `onStatus`: `connecting → open → reconnecting → open → … → closed`. Reconnect uses exponential backoff (1 s → 2 s → 4 s → …, capped at 30 s) and the subscription survives transient network failures until you call `sub.close()`.

By default it subscribes to your own `agent`. Pass `{ agent }` to watch a different agent.

Runtime note: the SDK prefers `globalThis.WebSocket` (browsers, Node 22+) and falls back to the `ws` package for older Node, resolved lazily so browser bundlers don't pull `ws` in.

## Paying with x402

`paymentRequired(fuel, options?)` returns a `fetch`-shaped function that transparently handles HTTP 402:

```ts
import { paymentRequired } from "@agent-fuel/sdk";

const fetchWithPayments = paymentRequired(fuel, {
  onPaymentRequired: (req) => console.log("paying", req.amountUsdc, "to", req.recipient),
  onPaid: (sig) => console.log("signature:", sig),
});

const res = await fetchWithPayments("https://data.example/feed");
const body = await res.json();
```

Flow:

1. The wrapped request runs.
2. If the response is `402`, the SDK parses the `X-Payment-Required` header (JSON; or the response body as a fallback) for `recipient` and `amountUsdc` — `payTo`/`maxAmountRequired` are accepted as aliases for x402-spec servers.
3. `fuel.spend()` is called with those values. All six policy guardrails apply; any failure throws the matching `SpendPolicyError` and the request is *not* retried.
4. The original request is retried once with `X-Payment: <signature>`.

A second `402` propagates to the caller (no infinite loop). Malformed payment payloads throw `PaymentParseError`.

There's a runnable example under [`examples/x402-quickstart/`](./examples/x402-quickstart/) with both a dry-run mode (no Solana, 5-second smoke) and a real-devnet mode.

## Program IDs

Re-exported from the vendored IDLs (see [`src/idl/`](src/idl/)):

```ts
import { PROGRAM_IDS } from "@agent-fuel/sdk";

PROGRAM_IDS.reputation; // PublicKey
PROGRAM_IDS.creditVault; // PublicKey
```

## IDL access

Raw IDLs are exposed under sub-paths for downstream tooling (e.g. Anchor's `Program` constructor):

```ts
import reputationIdl from "@agent-fuel/sdk/idl/reputation";
import creditVaultIdl from "@agent-fuel/sdk/idl/credit-vault";
```

## Development

```bash
npm install
npm run typecheck
npm run lint
npm run build        # emits dist/ (ESM + CJS + .d.ts) via tsup
```

### Bootstrapping a devnet sandbox

`npm run devnet:bootstrap` provisions a complete devnet environment in one command: deploys a test USDC mint, mints initial supply to the owner, registers a service, initializes an agent profile, creates + funds a vault, and verifies the whole graph by reading it back through the SDK.

```bash
npm run build           # bootstrap imports from dist/
npm run devnet:bootstrap
```

Defaults to the Solana CLI keypair at `~/.config/solana/id.json` as the owner-agent identity (needs ~0.05 SOL on devnet — `solana airdrop 1 --url devnet` if low). Generates the service + mint keypairs under `~/.config/agent-fuel/`, idempotently — reruns after a partial failure are safe.

The script writes a `devnet-config.json` manifest with every pubkey + path, and prints the exact env-var block to copy into the [x402-quickstart](./examples/x402-quickstart/) example for a real end-to-end `spend()` against devnet.

### Refreshing the IDLs

The IDLs under `src/idl/` are committed copies — the SDK build, CI, and downstream consumers never depend on `anchor build`. When the Anchor programs change, re-vendor manually and commit:

```bash
# at repo root
anchor build
# in clients/sdk/
npm run vendor-idl
git add src/idl/
```

### Releasing

Releases are tag-driven. The [`SDK Release`](../../.github/workflows/sdk-release.yml) workflow publishes to npm with provenance on any `sdk-v*` tag push, and refuses to publish if the tag, `package.json` version, and `CHANGELOG.md` don't all agree.

```bash
# 1. bump version in package.json + add a `## [x.y.z]` section to CHANGELOG.md
# 2. commit
git commit -am "release(sdk): v0.1.1"
# 3. tag + push
git tag sdk-v0.1.1
git push --follow-tags
# 4. (after publish lands) bump the pin in clients/web/package.json
```

The workflow needs the repo secret `NPM_TOKEN` (an automation token with publish rights to the `@agent-fuel` scope). Provenance attestation is handled by GitHub OIDC — no extra config needed beyond the `id-token: write` permission already in the workflow.
