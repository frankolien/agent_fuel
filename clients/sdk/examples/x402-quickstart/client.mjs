#!/usr/bin/env node
// x402 client driven by @agent-fuel/sdk.
//
// Two modes:
//   • Dry-run (default): no Solana, no keypair. Stubs `spend()` to return a
//     fake signature. Demonstrates the protocol + the SDK wrapper end-to-end.
//   • Devnet (X402_REAL=1 + AGENT_KEYPAIR_PATH=...): real spend against
//     Agent Fuel's credit_vault program on devnet. See README.md for prereqs.
//
// Run the server first:
//   node server.mjs &
//   node client.mjs

import { readFileSync } from "node:fs";
import { Keypair, PublicKey } from "@solana/web3.js";
import { AgentFuel, paymentRequired } from "../../dist/index.js";

const SERVER = process.env.X402_SERVER ?? "http://localhost:7402";

const fuel = await loadFuel();

const fetchWithPayments = paymentRequired(fuel, {
  onPaymentRequired: (req) => {
    console.log("← 402 Payment Required");
    console.log(`  pay ${req.amountUsdc} micro-USDC to ${shortKey(req.recipient)} (${req.network ?? "?"})`);
  },
  onPaid: (sig) => {
    console.log(`→ spend landed: ${shortSig(sig)}`);
  },
});

console.log(`GET ${SERVER}/feed`);
const res = await fetchWithPayments(`${SERVER}/feed`);
console.log(`← ${res.status} ${res.statusText}`);
const body = await res.json();
console.log(`  body:`, body);

// ---- mode plumbing ----

async function loadFuel() {
  if (process.env.X402_REAL === "1") {
    const path = process.env.AGENT_KEYPAIR_PATH;
    if (!path) {
      throw new Error("X402_REAL=1 requires AGENT_KEYPAIR_PATH to a Solana keypair JSON file");
    }
    const owner = process.env.VAULT_OWNER;
    if (!owner) {
      throw new Error("X402_REAL=1 requires VAULT_OWNER (base58 pubkey of the vault owner)");
    }
    const secret = Uint8Array.from(JSON.parse(readFileSync(path, "utf8")));
    const agent = Keypair.fromSecretKey(secret);
    console.log(`mode: devnet — agent ${shortKey(agent.publicKey.toBase58())}`);
    return new AgentFuel({
      agent,
      owner: new PublicKey(owner),
      cluster: "devnet",
      rpc: process.env.SOLANA_RPC ?? "https://api.devnet.solana.com",
      apiBase: process.env.AGENT_FUEL_API ?? "http://localhost:8080",
    });
  }

  console.log("mode: dry-run — spend() is stubbed (set X402_REAL=1 for devnet)");
  const stub = {
    spend: async ({ service, amountUsdc }) => ({
      signature: `dryRun${Math.random().toString(36).slice(2, 12)}${service.toString().slice(0, 6)}${amountUsdc}`,
    }),
  };
  return stub;
}

function shortKey(s) {
  return s.length > 12 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
}
function shortSig(s) {
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-6)}` : s;
}
