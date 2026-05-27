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

Talks to the real Agent Fuel `credit_vault` program on devnet. The SDK's bootstrap script handles all the on-chain prerequisites — a test USDC mint, a registered service, an initialized agent profile, and a funded vault — in one idempotent command:

```bash
# from clients/sdk/
npm run devnet:bootstrap
```

That prints the exact env-var block to use here. Then:

```bash
# in one shell
export X402_RECIPIENT=<service pubkey from the manifest>
export X402_AMOUNT_USDC=1000000            # 1 test-USDC, well under the vault's per-tx cap
node server.mjs

# in another shell — values come straight from the bootstrap output
export X402_REAL=1
export AGENT_KEYPAIR_PATH=~/.config/solana/id.json
export VAULT_OWNER=<owner pubkey from the manifest>
export SOLANA_RPC=https://api.devnet.solana.com
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
