#!/usr/bin/env node
// Raise (or lower) the spend policy caps on an existing vault.
//
// Reads devnet-config.json (written by devnet-bootstrap) for the owner keypair
// path, the vault PDA, and the current caps. Reads the current policy on-chain
// for whitelist + allow_post_pay (preserved), then submits update_policy with
// only the caps you override.
//
// Usage:
//   cd clients/sdk
//   PER_TX_USDC=10 node scripts/update-policy.mjs                   # raise per-tx only
//   HOURLY_USDC=50 LIFETIME_USDC=1000 node scripts/update-policy.mjs
//   PER_TX_USDC=10 HOURLY_USDC=50 node scripts/update-policy.mjs --config ./devnet-config.json
//
// All amounts are in whole test-USDC and converted to micro on submit. Omit any
// env var to leave that cap unchanged.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { policyPda } from "../dist/index.js";
import creditVaultIdl from "../dist/idl/credit-vault.js";

const args = parseArgs(process.argv.slice(2));
const CONFIG_PATH = args["--config"] ?? join(process.cwd(), "devnet-config.json");
const RPC = args["--rpc"];

const overrides = {
  perTx: parseOptionalUsdc("PER_TX_USDC"),
  hourly: parseOptionalUsdc("HOURLY_USDC"),
  lifetime: parseOptionalUsdc("LIFETIME_USDC"),
};
if (overrides.perTx == null && overrides.hourly == null && overrides.lifetime == null) {
  fail("set at least one of PER_TX_USDC, HOURLY_USDC, LIFETIME_USDC");
}

const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
const connection = new Connection(RPC ?? config.rpc, "confirmed");
const owner = loadKeypair(config.ownerAgent.keypairPath);
const vault = new PublicKey(config.vault);
const policy = policyPda(vault);

console.log(`# update-policy @ ${connection.rpcEndpoint}`);
console.log(`  vault:  ${vault.toBase58()}`);
console.log(`  policy: ${policy.toBase58()}\n`);

const program = programFor(owner);
const current = await program.account.spendPolicy.fetch(policy);

const newPerTx = overrides.perTx ?? Number(current.perTxLimitUsdc);
const newHourly = overrides.hourly ?? Number(current.hourlyLimitUsdc);
const newLifetime = overrides.lifetime ?? Number(current.lifetimeLimitUsdc);

console.log("caps");
console.log(`  per-tx:   ${Number(current.perTxLimitUsdc) / 1e6} → ${newPerTx / 1e6} test-USDC`);
console.log(`  hourly:   ${Number(current.hourlyLimitUsdc) / 1e6} → ${newHourly / 1e6} test-USDC`);
console.log(`  lifetime: ${Number(current.lifetimeLimitUsdc) / 1e6} → ${newLifetime / 1e6} test-USDC\n`);

if (
  newPerTx === Number(current.perTxLimitUsdc) &&
  newHourly === Number(current.hourlyLimitUsdc) &&
  newLifetime === Number(current.lifetimeLimitUsdc)
) {
  console.log("✓ no changes — policy already matches");
  process.exit(0);
}

console.log("… submitting update_policy");
const sig = await program.methods
  .updatePolicy(
    new BN(newPerTx),
    new BN(newHourly),
    new BN(newLifetime),
    current.allowPostPay,
    current.whitelist,
  )
  .accounts({
    owner: owner.publicKey,
    vault,
    policy,
  })
  .signers([owner])
  .rpc();
console.log(`✓ updated: ${shortSig(sig)}`);

config.policyCaps = {
  perTxUsdc: newPerTx,
  hourlyUsdc: newHourly,
  lifetimeUsdc: newLifetime,
};
writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
console.log(`\nupdated ${CONFIG_PATH}`);

// ---- helpers ----

function parseOptionalUsdc(envName) {
  const raw = process.env[envName];
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) fail(`${envName} must be a non-negative number (got ${raw})`);
  return Math.round(n * 1_000_000);
}

function loadKeypair(path) {
  const data = JSON.parse(readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(data));
}

function programFor(payerKp) {
  const provider = new AnchorProvider(
    connection,
    new Wallet(payerKp),
    AnchorProvider.defaultOptions(),
  );
  return new Program(creditVaultIdl, provider);
}

function shortSig(s) {
  return s.length > 16 ? `${s.slice(0, 8)}…${s.slice(-8)}` : s;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i]?.startsWith("--")) out[argv[i]] = argv[i + 1];
  }
  return out;
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}
