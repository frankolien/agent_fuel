# service-recorder

Worked example of the **service-side** half of an Agent Fuel payment loop.
Pairs with [`../pulse-agent`](../pulse-agent).

## Why it exists

`af.spend()` on the agent side moves USDC but **doesn't** update the agent's
reputation counters. That's intentional — the service is the natural attester
of "yes, I received this payment", and the chain enforces it: only the
service authority can sign `record_payment`.

In production, a real x402-style service would call `record_payment` as part
of accepting payment. For the demo, this script stands in: it watches the WS
stream for `Spent` events involving its own service pubkey, builds a receipt
hash from the spend signature, and submits the attestation. The agent's
reputation score starts moving immediately after the first attestation.

## Stack

| Layer | Purpose |
|---|---|
| [`@agent-fuel/sdk`](../../clients/sdk) | `recordPayment`, `subscribeService` |
| [`@solana/web3.js`](https://solana-labs.github.io/solana-web3.js/) | RPC client, keypair |

## Run it

```bash
cd examples/service-recorder
cp .env.example .env
# fill in SERVICE_KEYPAIR (base58 string from the console download, or the
# JSON array if you used solana-keygen)
npm install
npm run dev
```

You should see it print the service identity and "watching…", then nothing
until the agent (run `pulse-agent` in another terminal) issues a spend.
Each spend produces one `recorded` line here, and the agent's score starts
climbing within a few iterations of running `compute_score`.

## How to test the loop end-to-end

```
Terminal 1:                 Terminal 2:
cd examples/pulse-agent     cd examples/service-recorder
npm run dev                 npm run dev

# Watch in browser tab #1: /console/agents/<agent_pubkey>
# Watch in browser tab #2: /console/services/<service_pubkey>
```

Within ~75 seconds you'll see the agent's score flip from `—` to a real
number (`compute_score` fires every 5 spends; the recorder feeds the
counters; the agent reads the fresh score on the next iteration).
