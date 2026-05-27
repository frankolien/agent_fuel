# @agent-fuel/sdk

TypeScript SDK for [Agent Fuel](https://github.com/TODO/agent_fuel) — credit vault + reputation primitives for AI agents on Solana.

> **Status:** `0.1.0-alpha.0`. Read methods + `spend()` live. `onEvent()` and the x402 fetch helper land in subsequent slices ([phases.md](../../docs/phases.md)).

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
  apiBase: "http://localhost:8080", // your Agent Fuel backend
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

## Program IDs

Re-exported from the vendored IDLs (see `src/idl/`):

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

### Refreshing the IDLs

The IDLs under `src/idl/` are committed copies — the SDK build, CI, and downstream consumers never depend on `anchor build`. When the Anchor programs change, re-vendor manually and commit:

```bash
# at repo root
anchor build
# in clients/sdk/
npm run vendor-idl
git add src/idl/
```
