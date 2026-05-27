#!/usr/bin/env node
// Devnet bootstrap: deploys a test mint, registers a service, initializes an
// agent, creates + funds a vault. Outputs a JSON manifest that other examples
// (x402-quickstart, smoke tests) can source environment variables from.
//
// One keypair plays both `owner` and `agent` roles to keep the demo simple.
// The credit_vault program is fine with owner == agent — the vault PDA seeds
// are still unique because [b"vault", owner, agent] derives deterministically
// from the (matching) pubkeys.
//
// Defaults to using the Solana CLI keypair (~/.config/solana/id.json) as the
// owner-agent. The service keypair is generated fresh under --key-dir and
// funded by a direct transfer from owner-agent (devnet airdrop API is too
// rate-limited to rely on for multi-keypair flows).
//
// Idempotent: each step checks for existing state before mutating, so reruns
// after a partial failure are safe.
//
// Usage:
//   cd clients/sdk
//   npm run build
//   node scripts/devnet-bootstrap.mjs [--owner-key <path>] [--out <path>] [--key-dir <dir>]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
  getMint,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  PROGRAM_IDS,
  policyPda,
  serviceRegistryPda,
  vaultPda,
} from "../dist/index.js";
import creditVaultIdl from "../dist/idl/credit-vault.js";
import reputationIdl from "../dist/idl/reputation.js";

// ---- args ----

const args = parseArgs(process.argv.slice(2));
const KEY_DIR = args["--key-dir"] ?? join(homedir(), ".config", "agent-fuel");
const OUT_PATH = args["--out"] ?? join(process.cwd(), "devnet-config.json");
const RPC = args["--rpc"] ?? "https://api.devnet.solana.com";
const SOLANA_CLI_KEY = join(homedir(), ".config", "solana", "id.json");
const OWNER_KEY_PATH =
  args["--owner-key"] ??
  (existsSync(SOLANA_CLI_KEY) ? SOLANA_CLI_KEY : join(KEY_DIR, "owner-agent.json"));

const PER_TX_USDC = 1_000_000; // 1 test-USDC
const HOURLY_USDC = 5_000_000; // 5 test-USDC
const LIFETIME_USDC = 100_000_000; // 100 test-USDC
const DEPOSIT_USDC = 10_000_000; // 10 test-USDC
const INITIAL_MINT_USDC = 100_000_000; // 100 test-USDC to owner

const MIN_OWNER_SOL_LAMPORTS = 0.05 * LAMPORTS_PER_SOL;
const MIN_SERVICE_SOL_LAMPORTS = 0.005 * LAMPORTS_PER_SOL;
const SERVICE_FUND_LAMPORTS = 0.01 * LAMPORTS_PER_SOL;

// ---- main ----

mkdirSync(KEY_DIR, { recursive: true });

const connection = new Connection(RPC, "confirmed");

console.log(`# devnet bootstrap @ ${RPC}`);
console.log(`  keys → ${KEY_DIR}`);
console.log(`  out  → ${OUT_PATH}\n`);

const ownerAgent = loadOrCreateKeypair(OWNER_KEY_PATH);
const service = loadOrCreateKeypair(join(KEY_DIR, "service.json"));
const mintKp = loadOrCreateKeypair(join(KEY_DIR, "mint.json"));

console.log("identities");
console.log(`  owner+agent: ${ownerAgent.publicKey.toBase58()}  (${OWNER_KEY_PATH})`);
console.log(`  service:     ${service.publicKey.toBase58()}`);
console.log(`  mint:        ${mintKp.publicKey.toBase58()}\n`);

await assertOwnerSol(ownerAgent.publicKey);
await fundService(ownerAgent, service.publicKey);

await ensureMint(mintKp, ownerAgent);
await mintInitialUsdc(ownerAgent, mintKp.publicKey);

await ensureService(service);
await ensureAgent(ownerAgent);

const vault = vaultPda(ownerAgent.publicKey, ownerAgent.publicKey);
const policy = policyPda(vault);
await ensureVault(ownerAgent, mintKp.publicKey);

await ensureDeposit(ownerAgent, vault, mintKp.publicKey, DEPOSIT_USDC);

const verified = await verifyEverything(ownerAgent, service.publicKey);

const config = {
  cluster: "devnet",
  rpc: RPC,
  ownerAgent: {
    pubkey: ownerAgent.publicKey.toBase58(),
    keypairPath: OWNER_KEY_PATH,
  },
  service: {
    pubkey: service.publicKey.toBase58(),
    keypairPath: join(KEY_DIR, "service.json"),
  },
  mint: mintKp.publicKey.toBase58(),
  vault: vault.toBase58(),
  policy: policy.toBase58(),
  vaultTokenAccount: verified.vault_token_account,
  serviceRegistry: serviceRegistryPda(service.publicKey).toBase58(),
  policyCaps: {
    perTxUsdc: PER_TX_USDC,
    hourlyUsdc: HOURLY_USDC,
    lifetimeUsdc: LIFETIME_USDC,
  },
  balanceUsdc: verified.balance,
};

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(config, null, 2) + "\n");
console.log(`\n✓ wrote ${OUT_PATH}`);

console.log("\nrun x402-quickstart against devnet:");
console.log(`  export X402_REAL=1`);
console.log(`  export X402_RECIPIENT=${config.service.pubkey}`);
console.log(`  export X402_AMOUNT_USDC=${PER_TX_USDC}`);
console.log(`  export AGENT_KEYPAIR_PATH=${config.ownerAgent.keypairPath}`);
console.log(`  export VAULT_OWNER=${config.ownerAgent.pubkey}`);
console.log(`  export SOLANA_RPC=${RPC}`);
console.log(`  cd examples/x402-quickstart && node server.mjs &`);
console.log(`  node client.mjs`);

// ---- steps ----

function loadOrCreateKeypair(path) {
  if (existsSync(path)) {
    const secret = Uint8Array.from(JSON.parse(readFileSync(path, "utf8")));
    return Keypair.fromSecretKey(secret);
  }
  const kp = Keypair.generate();
  writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

async function assertOwnerSol(pubkey) {
  const balance = await connection.getBalance(pubkey);
  if (balance >= MIN_OWNER_SOL_LAMPORTS) {
    console.log(`✓ owner+agent has ${(balance / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
    return;
  }
  console.error(
    `\n× owner+agent has only ${(balance / LAMPORTS_PER_SOL).toFixed(3)} SOL`,
    `\n  need at least ${(MIN_OWNER_SOL_LAMPORTS / LAMPORTS_PER_SOL).toFixed(3)} for rent + fees.`,
    `\n  fund it: solana airdrop 1 ${pubkey.toBase58()} --url devnet`,
    `\n  (or https://faucet.solana.com — the CLI airdrop is usually more reliable)`,
  );
  process.exit(1);
}

async function fundService(payer, servicePubkey) {
  const balance = await connection.getBalance(servicePubkey);
  if (balance >= MIN_SERVICE_SOL_LAMPORTS) {
    console.log(`✓ service has ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    return;
  }
  console.log(`… funding service with ${(SERVICE_FUND_LAMPORTS / LAMPORTS_PER_SOL).toFixed(3)} SOL from owner+agent`);
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: servicePubkey,
      lamports: SERVICE_FUND_LAMPORTS,
    }),
  );
  const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
  console.log(`✓ service funded: ${shortSig(sig)}`);
}

async function ensureMint(mintKp, payer) {
  const info = await connection.getAccountInfo(mintKp.publicKey);
  if (info) {
    console.log(`✓ mint already exists`);
    return;
  }
  console.log(`… creating test-USDC mint (6 decimals)`);
  // SPL Token Mint account: 82 bytes
  const lamports = await connection.getMinimumBalanceForRentExemption(82);
  const createIx = SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: mintKp.publicKey,
    lamports,
    space: 82,
    programId: TOKEN_PROGRAM_ID,
  });
  // InitializeMint2 instruction: [20, decimals, mintAuthority(32), freezeAuthorityOption(1), ...]
  const data = Buffer.alloc(1 + 1 + 32 + 1 + 32);
  data.writeUInt8(20, 0); // InitializeMint2 discriminator
  data.writeUInt8(6, 1); // 6 decimals (matches USDC)
  payer.publicKey.toBuffer().copy(data, 2);
  data.writeUInt8(0, 34); // no freeze authority
  // pad with zeros (freeze authority pubkey ignored when option=0)
  const initIx = {
    programId: TOKEN_PROGRAM_ID,
    keys: [{ pubkey: mintKp.publicKey, isSigner: false, isWritable: true }],
    data: data.subarray(0, 35),
  };
  const tx = new Transaction().add(createIx, initIx);
  const sig = await sendAndConfirmTransaction(connection, tx, [payer, mintKp]);
  console.log(`✓ mint created: ${shortSig(sig)}`);
}

async function mintInitialUsdc(payer, mint) {
  const ownerAta = await getAssociatedTokenAddress(mint, payer.publicKey);
  const ataInfo = await connection.getAccountInfo(ownerAta);
  const mintInfo = await getMint(connection, mint);
  if (ataInfo && Number(mintInfo.supply) >= INITIAL_MINT_USDC) {
    console.log(`✓ owner already holds ${Number(mintInfo.supply) / 1e6} test-USDC`);
    return;
  }
  console.log(`… minting ${INITIAL_MINT_USDC / 1e6} test-USDC to owner ATA`);
  const tx = new Transaction();
  if (!ataInfo) {
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey,
        ownerAta,
        payer.publicKey,
        mint,
      ),
    );
  }
  tx.add(createMintToInstruction(mint, ownerAta, payer.publicKey, BigInt(INITIAL_MINT_USDC)));
  const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
  console.log(`✓ minted: ${shortSig(sig)}`);
}

async function ensureService(serviceKp) {
  const pda = serviceRegistryPda(serviceKp.publicKey);
  const info = await connection.getAccountInfo(pda);
  if (info) {
    console.log(`✓ service registry already exists at ${shortKey(pda)}`);
    return;
  }
  console.log(`… registering service`);
  const program = reputationProgramFor(serviceKp);
  const name = nameBytes("x402-quickstart");
  const sig = await program.methods
    .registerService(name, { other: {} })
    .accounts({
      service: serviceKp.publicKey,
      serviceRegistry: pda,
      systemProgram: SystemProgram.programId,
    })
    .signers([serviceKp])
    .rpc();
  console.log(`✓ service registered: ${shortSig(sig)}`);
}

async function ensureAgent(ownerAgentKp) {
  const [profile] = PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), ownerAgentKp.publicKey.toBuffer()],
    PROGRAM_IDS.reputation,
  );
  const info = await connection.getAccountInfo(profile);
  if (info) {
    console.log(`✓ agent profile already exists at ${shortKey(profile)}`);
    return;
  }
  console.log(`… initializing agent profile`);
  const program = reputationProgramFor(ownerAgentKp);
  const agentUri = uriBytes(`https://agent-fuel.dev/agent/${ownerAgentKp.publicKey.toBase58()}`);
  const sig = await program.methods
    .initializeAgent(agentUri, new BN(0))
    .accounts({
      owner: ownerAgentKp.publicKey,
      agent: ownerAgentKp.publicKey,
      agentProfile: profile,
      systemProgram: SystemProgram.programId,
    })
    .signers([ownerAgentKp])
    .rpc();
  console.log(`✓ agent initialized: ${shortSig(sig)}`);
}

async function ensureVault(ownerAgentKp, mint) {
  const vault = vaultPda(ownerAgentKp.publicKey, ownerAgentKp.publicKey);
  const info = await connection.getAccountInfo(vault);
  if (info) {
    console.log(`✓ vault already exists at ${shortKey(vault)}`);
    return;
  }
  console.log(`… creating vault + policy + vault ATA`);
  const policy = policyPda(vault);
  const vaultAta = await getAssociatedTokenAddress(mint, vault, true);
  const program = creditVaultProgramFor(ownerAgentKp);
  const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  );
  const sig = await program.methods
    .createVault(new BN(PER_TX_USDC), new BN(HOURLY_USDC), new BN(LIFETIME_USDC), false)
    .accounts({
      owner: ownerAgentKp.publicKey,
      agent: ownerAgentKp.publicKey,
      usdcMint: mint,
      vault,
      policy,
      vaultTokenAccount: vaultAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([ownerAgentKp])
    .rpc();
  console.log(`✓ vault created: ${shortSig(sig)}`);
}

async function ensureDeposit(ownerAgentKp, vault, mint, target) {
  const vaultAta = await getAssociatedTokenAddress(mint, vault, true);
  const ataInfo = await connection.getAccountInfo(vaultAta);
  if (ataInfo) {
    // Parse the SPL token amount from the account data (bytes 64..72 LE u64).
    const amount = Number(ataInfo.data.readBigUInt64LE(64));
    if (amount >= target) {
      console.log(`✓ vault already has ${amount / 1e6} test-USDC (target ${target / 1e6})`);
      return;
    }
  }
  const ownerAta = await getAssociatedTokenAddress(mint, ownerAgentKp.publicKey);
  console.log(`… depositing ${target / 1e6} test-USDC into vault`);
  const program = creditVaultProgramFor(ownerAgentKp);
  const sig = await program.methods
    .deposit(new BN(target))
    .accounts({
      owner: ownerAgentKp.publicKey,
      vault,
      ownerTokenAccount: ownerAta,
      vaultTokenAccount: vaultAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([ownerAgentKp])
    .rpc();
  console.log(`✓ deposited: ${shortSig(sig)}`);
}

async function verifyEverything(ownerAgentKp, servicePubkey) {
  console.log("\nverifying via SDK read methods…");
  const { AgentFuel } = await import("../dist/index.js");
  const fuel = new AgentFuel({
    agent: ownerAgentKp,
    owner: ownerAgentKp.publicKey,
    cluster: "devnet",
    rpc: connection,
  });
  const vault = await fuel.getVaultBalance();
  const policyAcc = await fuel.getPolicy();
  const svc = await fuel.checkService(servicePubkey);
  console.log(`  vault.balance         = ${vault.balance / 1e6} test-USDC`);
  console.log(`  policy.per_tx_limit   = ${policyAcc.per_tx_limit_usdc / 1e6}`);
  console.log(`  policy.hourly_limit   = ${policyAcc.hourly_limit_usdc / 1e6}`);
  console.log(`  policy.lifetime_limit = ${policyAcc.lifetime_limit_usdc / 1e6}`);
  console.log(`  service.name          = "${svc.name}"`);
  console.log(`  service.category      = ${svc.category}`);
  return {
    balance: vault.balance,
    vault_token_account: vault.vault_token_account.toBase58(),
  };
}

// ---- helpers ----

function reputationProgramFor(payerKp) {
  const provider = new AnchorProvider(connection, new Wallet(payerKp), AnchorProvider.defaultOptions());
  return new Program(reputationIdl, provider);
}

function creditVaultProgramFor(payerKp) {
  const provider = new AnchorProvider(connection, new Wallet(payerKp), AnchorProvider.defaultOptions());
  return new Program(creditVaultIdl, provider);
}

function nameBytes(s) {
  const buf = Buffer.alloc(32);
  Buffer.from(s, "utf8").copy(buf, 0, 0, Math.min(32, s.length));
  return Array.from(buf);
}

function uriBytes(s) {
  const buf = Buffer.alloc(128);
  Buffer.from(s, "utf8").copy(buf, 0, 0, Math.min(128, s.length));
  return Array.from(buf);
}

function shortSig(s) {
  return s.length > 16 ? `${s.slice(0, 8)}…${s.slice(-8)}` : s;
}
function shortKey(pk) {
  const s = pk.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i]?.startsWith("--")) out[argv[i]] = argv[i + 1];
  }
  return out;
}

// Silence the `resolve()` warning about unused import — keeps the import
// in place so the script's dependency on `node:path` is explicit.
void resolve;
