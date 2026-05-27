# x402-quickstart

End-to-end example showing how `@agent-fuel/sdk`'s `paymentRequired()` wrapper turns an HTTP 402 into a USDC spend and a successful retry.

```
                  GET /feed
   ┌────────┐ ──────────────► ┌────────┐
   │ client │                 │ server │
   │        │ ◄────────────── │        │   402 + X-Payment-Required
   │        │                 │        │
   │        │  fuel.spend()                fires on-chain
   │        │  ───────────►   chain
   │        │  ◄───────────   signature
   │        │                 │        │
   │        │ ──────────────► │        │   GET /feed, X-Payment: <sig>
   │        │                 │        │
   │        │ ◄────────────── │        │   200 + feed JSON
   └────────┘                 └────────┘
```

## Run it (dry-run)

No Solana keypair, no devnet, no setup. Stubs `spend()` so you see the protocol round-trip in 5 seconds.

```bash
# from repo root
cd clients/sdk
npm install
npm run build

cd examples/x402-quickstart
node server.mjs &        # listens on :7402
node client.mjs          # makes the call
```

Expected output:

```
mode: dry-run — spend() is stubbed (set X402_REAL=1 for devnet)
GET http://localhost:7402/feed
← 402 Payment Required
  pay 50000 micro-USDC to Serv…1111 (solana-devnet)
→ spend landed: dryRun…aBcDeF
← 200 OK
  body: { ok: true, data: { symbol: 'SOL/USDC', price: 158.42, ts: '…' } }
```

Tear down with `kill %1` (or `kill $(lsof -ti:7402)`).

## Run it (devnet)

Talks to the real Agent Fuel `credit_vault` program on devnet. You need:

1. **A funded Agent Fuel vault** — owner has registered an agent + created a vault + deposited devnet USDC. See the SDK README and program docs.
2. **A registered service** to receive the payment. Its authority pubkey is what the server returns in `X-Payment-Required.recipient`.
3. **The agent keypair JSON** (Solana CLI format: a JSON array of 64 bytes).
4. **`@agent-fuel/sdk` linked to your local checkout** — `npm link` from `clients/sdk/` then `npm link @agent-fuel/sdk` here, or just leave the relative `../../dist/index.js` import in `client.mjs`.

Then:

```bash
# in one shell — point the server at your real service authority
export X402_RECIPIENT=<service_authority_pubkey>
export X402_AMOUNT_USDC=50000           # 0.05 USDC
node server.mjs

# in another shell
export X402_REAL=1
export AGENT_KEYPAIR_PATH=~/.config/solana/agent.json
export VAULT_OWNER=<owner_pubkey>
export SOLANA_RPC=https://api.devnet.solana.com   # optional
export AGENT_FUEL_API=http://localhost:8080       # optional, defaults to localhost
node client.mjs
```

The client will:

1. Build an `AgentFuel` from the keypair + owner.
2. GET `/feed` and receive a 402.
3. Call `fuel.spend({ service: <recipient>, amountUsdc: <amount> })` — this hits devnet, the vault's policy ladder runs, USDC moves from the vault's ATA to the service's ATA, and a `Spent` event is emitted.
4. Retry the GET with `X-Payment: <signature>`.
5. Print the response.

You can confirm the spend on Solana Explorer using the signature, or watch it land live in the dashboard at <http://localhost:5173/console>.

## What this example does NOT do

* **No on-chain verification on the server side.** A production x402 service would either (a) poll the chain for the signature, (b) use a facilitator, or (c) require the client to send a signed payment intent rather than a landed signature. The example accepts any non-empty `X-Payment` header so you can focus on the client wrapper.
* **No devnet bootstrap.** Creating the vault, depositing USDC, and registering a service are one-time setup steps you do with the SDK's read/spend methods (or via a setup script — that's a planned slice).
