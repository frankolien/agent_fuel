// service-recorder — the service-side half of the demo loop.
//
// Subscribes to /ws/services/{servicePubkey}. On every `Spent` event whose
// payload mentions this service, builds a deterministic receipt hash from
// the spend's tx signature and submits `record_payment` on chain. That's
// the call that actually updates the agent's reputation counters.
//
// Run with:  npm run dev

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import {
  ReceiptAlreadyRecordedError,
  recordPayment,
  subscribeService,
  type LiveEventFrame,
} from "@agent-fuel/sdk";

const env = loadEnv();

const service = Keypair.fromSecretKey(env.SERVICE_KEYPAIR);
const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");

console.log(`recorder: service     ${service.publicKey.toBase58()}`);
console.log(`recorder: backend     ${env.AGENT_FUEL_API_BASE}`);
console.log(`recorder: rpc         ${env.SOLANA_RPC_URL}`);
console.log(`recorder: watching for Spent events…`);

// In-process guard against duplicate attestation attempts. The chain itself
// rejects duplicates too (via the ReceiptUsed PDA), but if the same Spent
// frame arrives twice in quick succession over a reconnect we don't want to
// pay two tx fees just to learn that.
const seen = new Set<string>();

const sub = subscribeService(env.AGENT_FUEL_API_BASE, service.publicKey.toBase58(), {
  onFrame: (frame) => {
    void onFrame(frame);
  },
  onStatus: (status) => {
    console.log(`recorder: ws ${status}`);
  },
});

// Keep-alive — Node otherwise exits when the top of the file finishes.
process.on("SIGINT", () => {
  console.log("\nrecorder: shutting down");
  sub.close();
  process.exit(0);
});

async function onFrame(frame: LiveEventFrame): Promise<void> {
  if (frame.event_name !== "Spent") return;

  const agentPubkey = strField(frame.payload, "agent");
  const amountUsdc = numField(frame.payload, "amount_usdc");
  if (!agentPubkey || amountUsdc === undefined) {
    console.warn(`recorder: skipped malformed Spent ${shorten(frame.signature)}`);
    return;
  }

  const key = `${frame.signature}:${frame.log_index}`;
  if (seen.has(key)) return;
  seen.add(key);

  // Receipt hash binds this attestation to the on-chain spend. Using the
  // spend's tx signature guarantees a different hash per spend (signatures
  // are globally unique) and lets anyone reverse-look the attestation back
  // to the underlying transfer.
  const receiptHash = sha256(bs58.decode(frame.signature));

  try {
    const { signature } = await recordPayment({
      service,
      agent: agentPubkey,
      amountUsdc,
      receiptHash,
      connection,
    });
    console.log(
      `recorder: recorded ${formatUsdc(amountUsdc)} from ` +
        `${shortenPk(agentPubkey)}  spend=${shorten(frame.signature)}  tx=${shorten(signature)}`,
    );
  } catch (err) {
    if (err instanceof ReceiptAlreadyRecordedError) {
      console.log(`recorder: ${shorten(frame.signature)} already recorded — skipping`);
      return;
    }
    console.error(`recorder: failed to record ${shorten(frame.signature)}: ${humanize(err)}`);
  }
}

function sha256(input: Uint8Array): Uint8Array {
  const hash = createHash("sha256");
  hash.update(input);
  return new Uint8Array(hash.digest());
}

function strField(payload: Record<string, unknown>, key: string): string | undefined {
  const v = payload[key];
  return typeof v === "string" ? v : undefined;
}

function numField(payload: Record<string, unknown>, key: string): number | undefined {
  const v = payload[key];
  return typeof v === "number" ? v : undefined;
}

function shorten(sig: string): string {
  return sig.length > 12 ? `${sig.slice(0, 6)}…${sig.slice(-4)}` : sig;
}

function shortenPk(pk: string): string {
  return pk.length > 12 ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : pk;
}

function formatUsdc(micro: number): string {
  return `$${(micro / 1_000_000).toFixed(4)}`;
}

function humanize(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

type Env = {
  SERVICE_KEYPAIR: Uint8Array;
  SOLANA_RPC_URL: string;
  AGENT_FUEL_API_BASE: string;
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
    if (!v) throw new Error(`env ${k} is missing`);
    return v;
  };
  return {
    SERVICE_KEYPAIR: parseSecretKey(need("SERVICE_KEYPAIR")),
    SOLANA_RPC_URL: need("SOLANA_RPC_URL"),
    AGENT_FUEL_API_BASE: need("AGENT_FUEL_API_BASE"),
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
      `SERVICE_KEYPAIR base58 decoded to ${decoded.length} bytes, expected 64 — ` +
        `make sure you pasted the secret key, not the public key`,
    );
  }
  return decoded;
}
