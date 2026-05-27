#!/usr/bin/env node
// Minimal x402 server. Serves one protected resource: GET /feed.
//
//   • First request (no X-Payment header) → 402 + X-Payment-Required payload.
//   • Retry with `X-Payment: <signature>` → 200 + feed JSON.
//
// We don't verify the payment on-chain here — that's a server-side concern
// (poll the chain, ask a facilitator, etc.). For the example we accept any
// non-empty X-Payment header, which is enough to demonstrate the protocol
// round-trip. The signature is logged so you can verify it on Solana Explorer.

import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 7402);
const RECIPIENT = process.env.X402_RECIPIENT ?? "ServiceAuthorityPubkeyGoesHere11111111111111";
const AMOUNT_USDC = Number(process.env.X402_AMOUNT_USDC ?? 50_000); // 0.05 USDC
const NETWORK = process.env.X402_NETWORK ?? "solana-devnet";

const server = createServer((req, res) => {
  if (req.url !== "/feed") {
    res.statusCode = 404;
    res.end("not found\n");
    return;
  }

  const payment = req.headers["x-payment"];
  if (typeof payment !== "string" || payment.length === 0) {
    const requirement = {
      recipient: RECIPIENT,
      amountUsdc: AMOUNT_USDC,
      network: NETWORK,
      resource: `http://localhost:${PORT}/feed`,
    };
    res.statusCode = 402;
    res.setHeader("X-Payment-Required", JSON.stringify(requirement));
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(requirement) + "\n");
    return;
  }

  console.log(`  paid with signature: ${payment.slice(0, 24)}…`);
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      ok: true,
      data: { symbol: "SOL/USDC", price: 158.42, ts: new Date().toISOString() },
    }) + "\n",
  );
});

server.listen(PORT, () => {
  console.log(`x402 server listening on http://localhost:${PORT}`);
  console.log(`  recipient: ${RECIPIENT}`);
  console.log(`  amount:    ${AMOUNT_USDC} micro-USDC`);
  console.log(`  network:   ${NETWORK}`);
});
