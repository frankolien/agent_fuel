# @agent-fuel/sdk

TypeScript SDK for [Agent Fuel](https://github.com/TODO/agent_fuel) — credit vault + reputation primitives for AI agents on Solana.

> **Status:** `0.1.0-alpha.0` — scaffold only. Read methods, `spend()`, `onEvent()`, and the x402 fetch helper land in subsequent slices ([phases.md](../../docs/phases.md)).

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
npm run vendor-idl   # copies target/idl/*.json into src/idl/
npm run typecheck
npm run lint
npm run build        # emits dist/ (ESM + CJS + .d.ts) via tsup
```

`vendor-idl` requires the workspace's `target/idl/` to be populated — run `anchor build` at the repo root first if the IDLs are missing.
