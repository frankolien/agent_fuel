# pulse-agent

A minimal worked example: a [Solana Agent Kit](https://github.com/sendaifun/solana-agent-kit)
agent that draws funds from an [Agent Fuel](../../) credit vault, capped by the
owner's policy and tracked by on-chain reputation.

## Why it exists

To answer "what does an Agent Fuel-integrated agent actually look like?" in
~80 lines. The action loop is intentionally stubbed — the wiring (env, SDK
imports, vault verification) is what's worth copying.

## Run it

```bash
# from the repo root
cd examples/pulse-agent
cp .env.example .env
# fill in AGENT_KEYPAIR, OWNER_PUBKEY, VAULT_PUBKEY
npm install
npm run dev
```

You should see the agent print its identity, vault, and confirm it can reach
the backend.

## Stack

| Layer | Purpose |
|---|---|
| [`solana-agent-kit`](https://github.com/sendaifun/solana-agent-kit) | On-chain action surface (swap, transfer, mint, etc.) |
| [`@agent-fuel/sdk`](../../clients/sdk) | Vault spend + reputation reads |
| Owner's vault | Caps per-tx / hourly / lifetime + whitelist of allowed services |
| Agent Fuel indexer | Emits live events → updates reputation + remaining caps |

## What to do next

1. Bootstrap a vault for this agent identity in the [console](https://agentfuel.online/console)
   with conservative caps (e.g. `$0.10` per-tx, `$1` hourly, `$10` lifetime).
2. Replace the `TODO` block in [`src/index.ts`](src/index.ts) with a real loop —
   pick any Solana Agent Kit action (e.g. read a price), settle the per-call
   fee with `af.spend(...)`, and watch the vault + reputation update live in
   the console.
3. Try blowing through the cap on purpose to see the freeze behaviour. That's
   the safety pitch in one screen.
