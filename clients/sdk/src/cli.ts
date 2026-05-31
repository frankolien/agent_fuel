#!/usr/bin/env node
// agent-fuel CLI — thin shell over the SDK.
//
// Three surfaces:
//   * read commands (no key)          : score / vault / policy / service
//   * action commands (--keypair)     : pay / request-spend / register-service
//   * dev helpers                     : keygen / version
//
// Output is human-readable by default; pass --json for machine-readable
// (one JSON object per command, suitable for piping into `jq`).

import { Command, Option } from "commander";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { AgentFuel } from "./client.js";
import type { Cluster } from "./client.js";
import { pay } from "./pay.js";
import { registerService } from "./register-service.js";
import { requestSpend } from "./request-spend.js";
import type { ServiceCategory } from "./types.js";

const VERSION = "0.3.0";

const RPC_DEFAULTS: Record<Cluster, string> = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  localnet: "http://127.0.0.1:8899",
};

const DEFAULT_API_BASE = "https://api.agentfuel.online";

type GlobalOpts = {
  cluster: Cluster;
  rpc?: string;
  apiBase: string;
  json: boolean;
};

function readGlobalOpts(cmd: Command): GlobalOpts {
  const root = rootOf(cmd);
  const o = root.opts<{
    cluster: Cluster;
    rpc?: string;
    apiBase?: string;
    json?: boolean;
  }>();
  const g: GlobalOpts = {
    cluster: o.cluster,
    apiBase: o.apiBase ?? DEFAULT_API_BASE,
    json: o.json ?? false,
  };
  if (o.rpc !== undefined) g.rpc = o.rpc;
  return g;
}

function rootOf(cmd: Command): Command {
  let cur = cmd;
  while (cur.parent) cur = cur.parent;
  return cur;
}

function connectionFor(g: GlobalOpts): Connection {
  return new Connection(g.rpc ?? RPC_DEFAULTS[g.cluster], "confirmed");
}

function loadKeypair(path: string): Keypair {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    throw new Error(`could not read keypair file '${path}': ${errMsg(e)}`);
  }
  let bytes: number[];
  try {
    bytes = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `keypair file '${path}' is not valid JSON (expected a 64-byte array, the same format \`solana-keygen new\` writes): ${errMsg(e)}`,
    );
  }
  if (!Array.isArray(bytes) || bytes.length !== 64) {
    throw new Error(
      `keypair file '${path}' must contain a JSON array of exactly 64 bytes (got ${Array.isArray(bytes) ? `${bytes.length}` : typeof bytes})`,
    );
  }
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

function parsePubkey(s: string, label: string): PublicKey {
  try {
    return new PublicKey(s);
  } catch {
    throw new Error(`${label} is not a valid base58 pubkey: ${s}`);
  }
}

function parseAmountToMicro(s: string): number {
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`--amount must be a positive number (USDC), got '${s}'`);
  }
  const micro = Math.round(n * 1_000_000);
  if (micro <= 0) throw new Error(`--amount too small: ${s}`);
  return micro;
}

function parseCategory(s: string): ServiceCategory {
  const lower = s.toLowerCase();
  switch (lower) {
    case "datafeed":
    case "data-feed":
      return "DataFeed";
    case "compute":
      return "Compute";
    case "swap":
      return "Swap";
    case "rpc":
      return "Rpc";
    case "other":
      return "Other";
    default:
      throw new Error(
        `--category must be one of: DataFeed, Compute, Swap, Rpc, Other (got '${s}')`,
      );
  }
}

function parseReceiptHash(s: string | undefined): Uint8Array {
  if (!s) return randomBytes(32);
  const hex = s.startsWith("0x") ? s.slice(2) : s;
  if (hex.length !== 64 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(
      `--receipt-hash must be 32 bytes hex (64 hex chars, with or without 0x prefix)`,
    );
  }
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

// AgentFuel's constructor wants a keypair even for read-only flows; we
// hand it a throwaway since nothing signs.
function readOnlyFuel(g: GlobalOpts): AgentFuel {
  return new AgentFuel({
    agent: Keypair.generate(),
    cluster: g.cluster,
    rpc: connectionFor(g),
    apiBase: g.apiBase,
  });
}

function emit(g: GlobalOpts, human: () => string, data: unknown): void {
  if (g.json) {
    process.stdout.write(JSON.stringify(data, jsonReplacer, 2) + "\n");
  } else {
    process.stdout.write(human() + "\n");
  }
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof PublicKey) return value.toBase58();
  if (value instanceof Uint8Array) return Buffer.from(value).toString("hex");
  return value;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function explorerUrl(cluster: Cluster, sig: string): string {
  const suffix = cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`;
  return `https://explorer.solana.com/tx/${sig}${suffix}`;
}

const program = new Command();

program
  .name("agent-fuel")
  .description(
    "Agent Fuel CLI — inspect vaults, register services, fire payments from the terminal.",
  )
  .version(VERSION)
  .addOption(
    new Option("--cluster <name>", "Solana cluster")
      .choices(["mainnet-beta", "devnet", "testnet", "localnet"] as const)
      .default("devnet" as Cluster),
  )
  .option("--rpc <url>", "override the default RPC URL for the chosen cluster")
  .option(
    "--api-base <url>",
    "Agent Fuel backend base URL (used by read commands)",
    DEFAULT_API_BASE,
  )
  .option("--json", "emit machine-readable JSON instead of human text");

// ---------------------------------------------------------------------------
// Read commands
// ---------------------------------------------------------------------------

program
  .command("score <agent>")
  .description("Show the latest reputation snapshot for an agent (REST, no key).")
  .action(async (agent: string, _opts, cmd: Command) => {
    const g = readGlobalOpts(cmd);
    const agentPk = parsePubkey(agent, "<agent>");
    const fuel = readOnlyFuel(g);
    const score = await fuel.getScore(agentPk);
    emit(g, () => formatScore(score), score);
  });

program
  .command("vault <owner> <agent>")
  .description("Show on-chain credit vault state for the (owner, agent) pair.")
  .action(async (owner: string, agent: string, _opts, cmd: Command) => {
    const g = readGlobalOpts(cmd);
    const ownerPk = parsePubkey(owner, "<owner>");
    const agentPk = parsePubkey(agent, "<agent>");
    const fuel = readOnlyFuel(g);
    const vault = await fuel.getVaultBalance({ owner: ownerPk, agent: agentPk });
    emit(g, () => formatVault(vault), vault);
  });

program
  .command("policy <owner> <agent>")
  .description("Show the spend policy guarding an (owner, agent) vault.")
  .action(async (owner: string, agent: string, _opts, cmd: Command) => {
    const g = readGlobalOpts(cmd);
    const ownerPk = parsePubkey(owner, "<owner>");
    const agentPk = parsePubkey(agent, "<agent>");
    const fuel = readOnlyFuel(g);
    const policy = await fuel.getPolicy({ owner: ownerPk, agent: agentPk });
    emit(g, () => formatPolicy(policy), policy);
  });

program
  .command("service <authority>")
  .description("Look up a registered service by its authority pubkey.")
  .action(async (authority: string, _opts, cmd: Command) => {
    const g = readGlobalOpts(cmd);
    const authPk = parsePubkey(authority, "<authority>");
    const fuel = readOnlyFuel(g);
    const svc = await fuel.checkService(authPk);
    emit(g, () => formatService(svc), svc);
  });

// ---------------------------------------------------------------------------
// Action commands
// ---------------------------------------------------------------------------

program
  .command("pay")
  .description(
    "Atomically spend from a vault and record the payment for reputation.",
  )
  .requiredOption("--keypair <path>", "agent keypair (signs the spend half)")
  .requiredOption("--service-keypair <path>", "service keypair (co-signs)")
  .requiredOption("--owner <pubkey>", "vault owner pubkey")
  .requiredOption("--amount <usdc>", "amount in USDC (e.g. 0.5)")
  .option(
    "--receipt-hash <hex>",
    "32-byte receipt hash as hex (auto-generated if omitted)",
  )
  .action(
    async (
      opts: {
        keypair: string;
        serviceKeypair: string;
        owner: string;
        amount: string;
        receiptHash?: string;
      },
      cmd: Command,
    ) => {
      const g = readGlobalOpts(cmd);
      const agent = loadKeypair(opts.keypair);
      const service = loadKeypair(opts.serviceKeypair);
      const owner = parsePubkey(opts.owner, "--owner");
      const amountUsdc = parseAmountToMicro(opts.amount);
      const receiptHash = parseReceiptHash(opts.receiptHash);
      const result = await pay({
        agent,
        service,
        owner,
        amountUsdc,
        receiptHash,
        connection: connectionFor(g),
      });
      emit(
        g,
        () =>
          [
            `paid ${opts.amount} USDC`,
            `  agent     ${agent.publicKey.toBase58()}`,
            `  service   ${service.publicKey.toBase58()}`,
            `  signature ${result.signature}`,
            `  ${explorerUrl(g.cluster, result.signature)}`,
          ].join("\n"),
        { ...result, receipt_hash: Buffer.from(receiptHash).toString("hex") },
      );
    },
  );

program
  .command("request-spend")
  .description(
    "Submit an over-limit spend that the owner must approve from the app.",
  )
  .requiredOption("--keypair <path>", "agent keypair (submits the request)")
  .requiredOption("--owner <pubkey>", "vault owner pubkey")
  .requiredOption("--service <pubkey>", "service authority pubkey")
  .requiredOption("--amount <usdc>", "amount in USDC (e.g. 5.0)")
  .action(
    async (
      opts: { keypair: string; owner: string; service: string; amount: string },
      cmd: Command,
    ) => {
      const g = readGlobalOpts(cmd);
      const agent = loadKeypair(opts.keypair);
      const owner = parsePubkey(opts.owner, "--owner");
      const service = parsePubkey(opts.service, "--service");
      const amountUsdc = parseAmountToMicro(opts.amount);
      const result = await requestSpend({
        agent,
        owner,
        service,
        amountUsdc,
        connection: connectionFor(g),
      });
      emit(
        g,
        () =>
          [
            `requested ${opts.amount} USDC (over-limit, awaiting owner approval)`,
            `  pending   ${result.pendingSpend.toBase58()}`,
            `  nonce     ${result.nonce}`,
            `  signature ${result.signature}`,
            `  ${explorerUrl(g.cluster, result.signature)}`,
          ].join("\n"),
        result,
      );
    },
  );

program
  .command("register-service")
  .description("Register a new service on chain (two-signer).")
  .requiredOption("--sponsor <path>", "sponsor keypair (pays rent, submits tx)")
  .requiredOption(
    "--service-keypair <path>",
    "service keypair (long-lived signing identity)",
  )
  .requiredOption("--name <name>", "service name (max 32 bytes UTF-8)")
  .requiredOption(
    "--category <c>",
    "DataFeed | Compute | Swap | Rpc | Other",
  )
  .option("--uri <url>", "optional off-chain metadata URI (max 128 bytes)")
  .action(
    async (
      opts: {
        sponsor: string;
        serviceKeypair: string;
        name: string;
        category: string;
        uri?: string;
      },
      cmd: Command,
    ) => {
      const g = readGlobalOpts(cmd);
      const sponsor = loadKeypair(opts.sponsor);
      const service = loadKeypair(opts.serviceKeypair);
      const category = parseCategory(opts.category);
      const registerArgs: import("./register-service.js").RegisterServiceArgs = {
        sponsor,
        service,
        name: opts.name,
        category,
        connection: connectionFor(g),
      };
      if (opts.uri !== undefined) registerArgs.serviceUri = opts.uri;
      const result = await registerService(registerArgs);
      emit(
        g,
        () =>
          [
            `registered service "${opts.name}" (${category})`,
            `  authority ${service.publicKey.toBase58()}`,
            `  sponsor   ${sponsor.publicKey.toBase58()}`,
            `  signature ${result.signature}`,
            `  ${explorerUrl(g.cluster, result.signature)}`,
          ].join("\n"),
        result,
      );
    },
  );

// ---------------------------------------------------------------------------
// Dev helpers
// ---------------------------------------------------------------------------

program
  .command("keygen")
  .description(
    "Generate a new Solana keypair (compatible with solana-keygen JSON format).",
  )
  .option(
    "--out <path>",
    "write the secret-key JSON to a file (parent dirs created)",
  )
  .action((opts: { out?: string }, cmd: Command) => {
    const g = readGlobalOpts(cmd);
    const kp = Keypair.generate();
    const bytes = Array.from(kp.secretKey);
    const pub = kp.publicKey.toBase58();
    if (opts.out) {
      mkdirSync(dirname(opts.out), { recursive: true });
      writeFileSync(opts.out, JSON.stringify(bytes), { mode: 0o600 });
      emit(
        g,
        () => `wrote keypair to ${opts.out}\n  pubkey ${pub}`,
        { pubkey: pub, path: opts.out },
      );
    } else {
      // No --out: pubkey to stdout in human mode, secret to stderr so the
      // user can choose to redirect it. JSON mode dumps both together.
      if (g.json) {
        emit(g, () => "", { pubkey: pub, secret_key: bytes });
      } else {
        process.stderr.write(JSON.stringify(bytes) + "\n");
        process.stdout.write(`pubkey ${pub}\n`);
      }
    }
  });

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatScore(s: import("./types.js").ReputationLookup): string {
  return [
    `agent              ${s.agent}`,
    `score              ${s.score ?? "(unscored)"}`,
    `transactions       ${s.total_transactions}`,
    `services used      ${s.services_used}`,
    `volume USDC        ${micro(s.total_volume_usdc)}`,
    `consecutive ok     ${s.consecutive_success}`,
    `feedback total     ${s.total_feedback_count}`,
    `feedback negative  ${s.active_negative_feedback_count}`,
    `last active slot   ${s.last_active_slot}`,
    `updated            ${s.updated_at}`,
  ].join("\n");
}

function formatVault(v: import("./types.js").CreditVaultAccount): string {
  return [
    `vault              ${v.pubkey.toBase58()}`,
    `owner              ${v.owner.toBase58()}`,
    `agent              ${v.agent.toBase58()}`,
    `usdc mint          ${v.usdc_mint.toBase58()}`,
    `vault token acct   ${v.vault_token_account.toBase58()}`,
    `balance            ${micro(v.balance)} USDC`,
    `  deposited        ${micro(v.total_deposited)}`,
    `  withdrawn        ${micro(v.total_withdrawn)}`,
    `  spent            ${micro(v.total_spent)}`,
    `  claimed          ${micro(v.total_claimed)}`,
    `frozen             ${v.frozen}`,
    `pending count      ${v.pending_count}`,
    `last active slot   ${v.last_active_slot}`,
  ].join("\n");
}

function formatPolicy(p: import("./types.js").SpendPolicyAccount): string {
  const whitelist = p.whitelist.length
    ? p.whitelist.map((pk) => `  - ${pk.toBase58()}`).join("\n")
    : "  (empty — no whitelist enforcement)";
  return [
    `policy             ${p.pubkey.toBase58()}`,
    `vault              ${p.vault.toBase58()}`,
    `per-tx limit       ${micro(p.per_tx_limit_usdc)} USDC`,
    `hourly limit       ${micro(p.hourly_limit_usdc)} USDC`,
    `lifetime limit     ${micro(p.lifetime_limit_usdc)} USDC`,
    `hourly window slot ${p.hourly_window_start_slot}`,
    `hourly spent       ${micro(p.hourly_window_spent_usdc)} USDC`,
    `allow post-pay     ${p.allow_post_pay}`,
    `whitelist:`,
    whitelist,
  ].join("\n");
}

function formatService(s: import("./types.js").ServiceRegistryAccount): string {
  return [
    `registry           ${s.pubkey.toBase58()}`,
    `authority          ${s.authority.toBase58()}`,
    `name               ${s.name}`,
    `category           ${s.category}`,
    `active             ${s.active}`,
    `agents served      ${s.total_agents_served}`,
    `volume received    ${micro(s.total_volume_received_usdc)} USDC`,
    `first active slot  ${s.first_active_slot}`,
    `last active slot   ${s.last_active_slot}`,
  ].join("\n");
}

function micro(n: number): string {
  return (n / 1_000_000).toFixed(6);
}

// ---------------------------------------------------------------------------
// Entry point — surface SDK errors as one-line messages instead of stack
// traces, and exit non-zero so shell pipelines can branch on success.
// ---------------------------------------------------------------------------

program.exitOverride();

program.parseAsync(process.argv).catch((err: unknown) => {
  // Commander's --help and --version go through exitOverride() as throws;
  // they're not real errors and shouldn't print to stderr.
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code: unknown }).code;
    if (code === "commander.help" || code === "commander.helpDisplayed" || code === "commander.version") {
      process.exit(0);
    }
  }
  const msg = errMsg(err);
  process.stderr.write(`agent-fuel: ${msg}\n`);
  process.exit(1);
});
