#!/usr/bin/env node
// Top up the vault from the owner's USDC ATA.
//
// Reads devnet-config.json (written by devnet-bootstrap) for the owner keypair
// path, the mint, and the vault PDA. Mints more test-USDC to the owner's ATA
// first if its balance is below the requested amount.
//
// Usage:
//   cd clients/sdk
//   USDC_AMOUNT=50 node scripts/topup.mjs           # deposit 50 test-USDC
//   USDC_AMOUNT=50 node scripts/topup.mjs --config ./devnet-config.json
//
// Idempotent in the sense that re-running with the same amount just deposits
// again — the vault balance keeps climbing. Use `update-policy.mjs` separately
// to raise lifetime caps if you're approaching them.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAccount,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import creditVaultIdl from "../dist/idl/credit-vault.js";

const args = parseArgs(process.argv.slice(2));
const CONFIG_PATH = args["--config"] ?? join(process.cwd(), "devnet-config.json");
const RPC = args["--rpc"];
const USDC_AMOUNT_WHOLE = Number(process.env.USDC_AMOUNT ?? 10);
if (!Number.isFinite(USDC_AMOUNT_WHOLE) || USDC_AMOUNT_WHOLE <= 0) {
  fail(`USDC_AMOUNT must be a positive number (got ${process.env.USDC_AMOUNT})`);
}
const AMOUNT_MICRO = Math.round(USDC_AMOUNT_WHOLE * 1_000_000);

const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
const connection = new Connection(RPC ?? config.rpc, "confirmed");
const owner = loadKeypair(config.ownerAgent.keypairPath);
const mint = new PublicKey(config.mint);
const vault = new PublicKey(config.vault);

console.log(`# topup @ ${connection.rpcEndpoint}`);
console.log(`  vault:  ${vault.toBase58()}`);
console.log(`  mint:   ${mint.toBase58()}`);
console.log(`  amount: ${USDC_AMOUNT_WHOLE} test-USDC\n`);

const ownerAta = await getAssociatedTokenAddress(mint, owner.publicKey);
const ownerAtaBal = await balanceOf(ownerAta);
console.log(`  owner ATA balance: ${ownerAtaBal / 1e6} test-USDC`);

if (ownerAtaBal < AMOUNT_MICRO) {
  const need = AMOUNT_MICRO - ownerAtaBal;
  console.log(`… owner short by ${need / 1e6} — minting more to owner ATA`);
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      owner.publicKey,
      ownerAta,
      owner.publicKey,
      mint,
    ),
    createMintToInstruction(mint, ownerAta, owner.publicKey, BigInt(need)),
  );
  const sig = await sendAndConfirmTransaction(connection, tx, [owner]);
  console.log(`✓ minted: ${shortSig(sig)}`);
}

const vaultAta = await getAssociatedTokenAddress(mint, vault, true);
const beforeVault = await balanceOf(vaultAta);
console.log(`  vault balance before: ${beforeVault / 1e6} test-USDC`);

console.log(`… depositing ${USDC_AMOUNT_WHOLE} test-USDC into vault`);
const program = programFor(owner);
const sig = await program.methods
  .deposit(new BN(AMOUNT_MICRO))
  .accounts({
    owner: owner.publicKey,
    vault,
    ownerTokenAccount: ownerAta,
    vaultTokenAccount: vaultAta,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([owner])
  .rpc();
console.log(`✓ deposited: ${shortSig(sig)}`);

const afterVault = await balanceOf(vaultAta);
console.log(`  vault balance after:  ${afterVault / 1e6} test-USDC`);

// Persist the new vault balance back to the config manifest so other
// examples (x402-quickstart, smoke tests) see the right starting state.
config.balanceUsdc = afterVault;
writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
console.log(`\nupdated ${CONFIG_PATH}`);

// ---- helpers ----

async function balanceOf(ata) {
  try {
    const acc = await getAccount(connection, ata);
    return Number(acc.amount);
  } catch {
    return 0;
  }
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
