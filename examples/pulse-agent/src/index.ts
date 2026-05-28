// Pulse — worked example of an agent funded by an Agent Fuel credit vault.
//
// Loop:
//   1. Read this agent's current reputation score.
//   2. Read SOL/USD price from Pyth Hermes (the "service" the agent consumes).
//   3. Settle a $0.01 USDC fee against the configured service via af.spend().
//   4. Sleep, repeat.
//
// Watch the Agent Fuel console in another tab while this runs — the vault's
// "Spent" counter ticks live, and the agent's reputation score climbs as
// successful payments accumulate.
//
// Run with:  npm run dev

import { readFileSync } from "node:fs";
import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { AgentFuel } from "@agent-fuel/sdk";

const env = loadEnv();

const af = new AgentFuel({
  agent: Keypair.fromSecretKey(env.AGENT_KEYPAIR),
  cluster: "devnet",
  rpc: env.SOLANA_RPC_URL,
  owner: env.OWNER_PUBKEY,
  apiBase: env.AGENT_FUEL_API_BASE,
});

const service = new PublicKey(env.SERVICE_PUBKEY);

// SOL/USD feed id from Pyth (Hermes mainnet — the price is the same across
// clusters since Hermes itself is global). Declared up here so it's initialised
// before `await main()` parks the module — otherwise the loop hits TDZ.
const PYTH_SOL_USD =
  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

// Recompute the on-chain score every N successful spends. compute_score is
// permissionless but costs a tx fee, so we batch — running it on every spend
// would double the fee load with no useful resolution gain (the underlying
// counters change at most once per spend). Same TDZ-avoidance reason as above:
// any reference inside `loop()` reads this on iteration 1.
const SCORE_RECOMPUTE_EVERY = 5;

await main();

async function main(): Promise<void> {
  await printSetup();
  await loop();
}

async function printSetup(): Promise<void> {
  console.log(`pulse: agent       ${af.agentPubkey.toBase58()}`);
  console.log(`pulse: owner       ${env.OWNER_PUBKEY}`);
  console.log(`pulse: vault       ${env.VAULT_PUBKEY}`);
  console.log(`pulse: service     ${service.toBase58()}`);
  console.log(`pulse: backend     ${env.AGENT_FUEL_API_BASE}`);

  const vault = await af.getVaultBalance().catch((err) => {
    console.error(
      "pulse: couldn't read vault — confirm OWNER_PUBKEY matches the wallet " +
        "that created VAULT_PUBKEY, and that this AGENT_KEYPAIR was the " +
        "agent it was bound to.\n " +
        humanize(err),
    );
    process.exit(1);
  });
  // The SDK already pre-computes `balance` (deposited − withdrawn − spent +
  // claimed), so we don't have to re-derive it here.
  console.log(
    `pulse: vault balance ${formatUsdc(vault.balance)}, ` +
      `deposited ${formatUsdc(vault.total_deposited)}, ` +
      `spent ${formatUsdc(vault.total_spent)}`,
  );
}

async function loop(): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      const [score, sol] = await Promise.all([safeScore(), fetchSolUsd()]);

      console.log(
        `pulse[${i}] score=${score ?? "—"}  SOL/USD=$${sol.toFixed(2)}  spending $0.01…`,
      );

      const { signature } = await af.spend({
        service,
        amountUsdc: 10_000, // micro-USDC; 10_000 = $0.01
      });
      console.log(`pulse[${i}] ok    ${shorten(signature)}`);

      if (i % SCORE_RECOMPUTE_EVERY === 0) {
        await recomputeScore(i);
      }
    } catch (err) {
      // Spend failures are usually one of: cap hit, vault frozen, service not
      // whitelisted, insufficient balance. The SDK's mapSpendError turns each
      // into a typed error with a useful message.
      console.error(`pulse[${i}] fail  ${humanize(err)}`);
    }
    await sleep(15_000);
  }
}

async function recomputeScore(i: number): Promise<void> {
  try {
    const { signature } = await af.computeScore();
    // Backend lag: it takes a moment for the webhook to land + the mirror to
    // converge. A short delay before the read avoids printing the stale value.
    await sleep(2_000);
    const r = await af.getScore();
    console.log(
      `pulse[${i}] score → ${r.score ?? "—"}  (tx ${shorten(signature)})`,
    );
  } catch (err) {
    console.error(`pulse[${i}] score recompute failed: ${humanize(err)}`);
  }
}

async function safeScore(): Promise<number | null> {
  try {
    const r = await af.getScore();
    return r.score;
  } catch {
    // Agent isn't indexed yet (no AgentInitialized event observed). That's
    // fine — first spend will register it.
    return null;
  }
}

async function fetchSolUsd(): Promise<number> {
  const url = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${PYTH_SOL_USD}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`pyth ${res.status}`);
  const json = (await res.json()) as {
    parsed: { price: { price: string; expo: number } }[];
  };
  const p = json.parsed[0]?.price;
  if (!p) throw new Error("pyth: empty response");
  return Number(p.price) * 10 ** p.expo;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function shorten(sig: string): string {
  return sig.length > 12 ? `${sig.slice(0, 6)}…${sig.slice(-4)}` : sig;
}

function formatUsdc(micro: number): string {
  return `$${(micro / 1_000_000).toFixed(4)}`;
}

function humanize(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

type Env = {
  AGENT_KEYPAIR: Uint8Array;
  OWNER_PUBKEY: string;
  VAULT_PUBKEY: string;
  SERVICE_PUBKEY: string;
  AGENT_FUEL_API_BASE: string;
  SOLANA_RPC_URL: string;
};

function loadEnv(): Env {
  const text = (() => {
    try {
      return readFileSync(new URL("../.env", import.meta.url), "utf8");
    } catch {
      throw new Error("missing .env — copy .env.example and fill it in");
    }
  })();
  const map = new Map<string, string>();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    map.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
  }
  const need = (k: string): string => {
    const v = map.get(k);
    if (!v || v.startsWith("[1,2,3")) {
      throw new Error(`env ${k} is missing or still the placeholder`);
    }
    return v;
  };
  return {
    AGENT_KEYPAIR: parseSecretKey(need("AGENT_KEYPAIR")),
    OWNER_PUBKEY: need("OWNER_PUBKEY"),
    VAULT_PUBKEY: need("VAULT_PUBKEY"),
    SERVICE_PUBKEY: need("SERVICE_PUBKEY"),
    AGENT_FUEL_API_BASE: need("AGENT_FUEL_API_BASE"),
    SOLANA_RPC_URL: need("SOLANA_RPC_URL"),
  };
}

function parseSecretKey(raw: string): Uint8Array {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed) as number[];
    return Uint8Array.from(arr);
  }
  const decoded = bs58.decode(trimmed);
  if (decoded.length !== 64) {
    throw new Error(
      `AGENT_KEYPAIR base58 decoded to ${decoded.length} bytes, expected 64 — ` +
        `make sure you pasted the secret key, not the public key`,
    );
  }
  return decoded;
}
