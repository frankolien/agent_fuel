#!/usr/bin/env node
// Smoke test for the SDK's read + live-event surface against a running
// backend with seeded data.
//
// Prereqs:
//   • `npm run build` in clients/sdk (this script imports from dist/)
//   • backend running at http://localhost:8080
//   • seed_dashboard.rs run at least once
//
// Usage:
//   node scripts/smoke.mjs <agent_pubkey> [backend_url]
//
// Then in another terminal, re-run the seed to drive live frames:
//   cargo run -p agent_fuel_backend --example seed_dashboard -- <owner>

import { Keypair } from "@solana/web3.js";
import { AccountNotFoundError, AgentFuel, HttpError } from "../dist/index.js";

const [, , agentArg, apiBaseArg] = process.argv;
if (!agentArg) {
  console.error("usage: node scripts/smoke.mjs <agent_pubkey> [backend_url]");
  process.exit(1);
}
const apiBase = apiBaseArg ?? "http://localhost:8080";

const fuel = new AgentFuel({
  agent: Keypair.generate(), // throwaway: we're not signing anything
  cluster: "devnet",
  rpc: "https://api.devnet.solana.com",
  apiBase,
});

console.log(`# smoke: apiBase=${apiBase} agent=${agentArg}\n`);

// 1) REST: getScore
try {
  console.log("→ getScore()");
  const score = await fuel.getScore(agentArg);
  console.log("  ok", {
    score: score.score,
    total_transactions: score.total_transactions,
    total_volume_usdc: score.total_volume_usdc,
    services_used: score.services_used,
    last_active_slot: score.last_active_slot,
  });
} catch (err) {
  if (err instanceof AccountNotFoundError) {
    console.error(`  fail: agent ${agentArg} not in mirror table — run seed_dashboard first`);
  } else if (err instanceof HttpError) {
    console.error(`  fail: HTTP ${err.status} from ${err.url}`);
  } else {
    console.error("  fail:", err);
  }
  process.exit(1);
}

// 2) WS: onEvent — listen for 30s, print every frame, then close.
console.log("\n→ onEvent (30s window)");
let count = 0;
const sub = fuel.onEvent(
  (frame) => {
    count += 1;
    console.log(`  ${String(count).padStart(2, "0")} [${frame.event_name}] slot=${frame.slot} sig=${frame.signature}`);
  },
  {
    agent: agentArg,
    onStatus: (s) => console.log(`  ws: ${s}`),
  },
);

setTimeout(() => {
  sub.close();
  console.log(`\n→ done: ${count} frames received`);
  console.log("  (re-run seed_dashboard in another shell to drive new frames)");
  // Give close events a tick to flush, then exit.
  setTimeout(() => process.exit(0), 100);
}, 30_000);
