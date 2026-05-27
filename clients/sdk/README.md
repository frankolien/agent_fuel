# @agent-fuel/sdk

TypeScript SDK for [Agent Fuel](https://github.com/TODO/agent_fuel) — credit vault + reputation primitives for AI agents on Solana.

> **Status:** `0.1.0-alpha.0`. Read methods live. `spend()`, `onEvent()`, and the x402 fetch helper land in subsequent slices ([phases.md](../../docs/phases.md)).

## Install

```bash
npm install @agent-fuel/sdk @solana/web3.js @coral-xyz/anchor
```

`@solana/web3.js` and `@coral-xyz/anchor` are peer dependencies; pin them yourself so your bot and the SDK share the same RPC client.

## Usage

```ts
import { Keypair } from "@solana/web3.js";
import { AgentFuel } from "@agent-fuel/sdk";

const agent = Keypair.generate(); // load yours from a keystore

const fuel = new AgentFuel({
  agent,
  cluster: "devnet",
  rpc: "https://api.devnet.solana.com",
  apiBase: "http://localhost:8080", // your Agent Fuel backend
});

console.log(fuel.agentPubkey.toBase58());
```

## Read methods

```ts
// Public reputation snapshot (REST, no auth).
const score = await fuel.getScore(agentPubkey);

// On-chain credit vault state. Vault PDA is `[b"vault", owner, agent]`,
// so both keys are required.
const vault = await fuel.getVaultBalance({ owner, agent });
console.log(vault.balance, vault.frozen);

// On-chain spend policy: per-tx / hourly / lifetime caps + whitelist.
const policy = await fuel.getPolicy({ owner, agent });

// Service registry lookup by the service's authority pubkey.
const service = await fuel.checkService(serviceAuthorityPubkey);
```

All methods throw `AccountNotFoundError` when the target doesn't exist on-chain (or returns 404 from the backend), and `HttpError` for non-2xx REST responses. Field names mirror the on-chain layout in `snake_case` so they line up with the backend's REST responses.

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
