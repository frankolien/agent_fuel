// Seed data for the `VITE_USE_MOCKS=1` path. Shapes mirror the backend's
// `*Row` structs exactly so the screens render identically online or offline.

import type {
  Agent,
  EventRow,
  ReputationLookup,
  ScorePoint,
  SiwsNonceResponse,
  SiwsVerifyResponse,
  Vault,
} from "@/types/api";

const OWNER = "ownE7r9kN3mB7vZ4xC2tL5wY8sE6dF1gA9uN7bMcXrJp1Q";
const NOW = "2026-05-27T00:00:00Z";
const SLOT = 287_540_312;
const USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

function agent(
  pubkey: string,
  score: number,
  txs: number,
  volumeDollars: number,
  services: number,
  streak: number,
): Agent {
  return {
    pubkey,
    owner: OWNER,
    init_slot: SLOT - 5_000_000,
    score,
    total_transactions: txs,
    total_volume_usdc: Math.round(volumeDollars * 1_000_000),
    services_used: services,
    consecutive_success: streak,
    total_feedback_count: Math.floor(txs / 100),
    active_negative_feedback_count: score === 0 ? 0 : Math.max(0, Math.floor((1000 - score) / 50)),
    last_active_slot: SLOT - 200,
    updated_at: NOW,
  };
}

export const MOCK_AGENTS: ReadonlyArray<Agent> = [
  agent("AtL5s9MmK3vN8bZ4xC7tL2pQ7vK1mY3jL6wE9dF2gA8uN7m", 947, 14213, 412.88, 8, 982),
  agent("OrCh4rd2pQ7vK1mY3jL5tH6wE9dF2gA4uN8bMcXrZvB7nm", 812, 6021, 188.55, 6, 411),
  agent("KePl3R7wKvP3nM4bZ6rT5jL8sE1dY9gA4uN2bMcXrQvH8p", 688, 1421, 62.1, 11, 88),
  agent("VgA2sEttl6wKvP3nM4bZ8rT5jL2sE7dY9gA4uN1bMcXrJp", 901, 9412, 612.4, 4, 1422),
  agent("LuM3nN8sR2pQ7vK1mY3jL5tH6wE9dF2gA4uN8bMcXrZvk2", 421, 812, 41.2, 7, 22),
  agent("SaBl3MeV6wKvP3nM4bZ8rT5jL2sE7dY9gA4uN1bMcXrQVx", 0, 0, 0, 0, 0),
];

function vault(
  pubkey: string,
  agentPk: string,
  depositedDollars: number,
  spentDollars: number,
  perTx: number,
  perHour: number,
  ceiling: number,
  postPay: boolean,
  frozen: boolean,
): Vault {
  const toMicro = (d: number) => Math.round(d * 1_000_000);
  return {
    pubkey,
    owner: OWNER,
    agent: agentPk,
    usdc_mint: USDC_MINT,
    vault_token_account: `ata_${pubkey.slice(0, 16)}`,
    total_deposited: toMicro(depositedDollars),
    total_withdrawn: 0,
    total_spent: toMicro(spentDollars),
    total_claimed: 0,
    frozen,
    per_tx_limit_usdc: toMicro(perTx),
    hourly_limit_usdc: toMicro(perHour),
    lifetime_limit_usdc: toMicro(ceiling),
    allow_post_pay: postPay,
    whitelist: [],
    created_slot: SLOT - 5_000_000,
    last_active_slot: SLOT - 200,
    updated_at: NOW,
  };
}

export const MOCK_VAULTS: ReadonlyArray<Vault> = [
  vault("vAuLtAtL5s9MmK3vN8bZ4xC7tL2pQ7vK1mY3jL6wE9dF2g", MOCK_AGENTS[0]!.pubkey, 5000, 3127.42, 25, 240, 5000, true, false),
  vault("vAuLtOrCh4rd2pQ7vK1mY3jL5tH6wE9dF2gA4uN8bMcXrZ", MOCK_AGENTS[1]!.pubkey, 2000, 1402.1, 10, 120, 2000, true, false),
  vault("vAuLtKePl3R7wKvP3nM4bZ6rT5jL8sE1dY9gA4uN2bMcXr", MOCK_AGENTS[2]!.pubkey, 1500, 612.3, 8, 60, 1500, false, false),
  vault("vAuLtVgA2sEttl6wKvP3nM4bZ8rT5jL2sE7dY9gA4uN1bM", MOCK_AGENTS[3]!.pubkey, 8000, 4111.88, 50, 800, 8000, true, false),
  vault("vAuLtLuM3nN8sR2pQ7vK1mY3jL5tH6wE9dF2gA4uN8bMcX", MOCK_AGENTS[4]!.pubkey, 750, 681.2, 5, 30, 750, false, false),
  vault("vAuLtSaBl3MeV6wKvP3nM4bZ8rT5jL2sE7dY9gA4uN1bMc", MOCK_AGENTS[5]!.pubkey, 500, 0, 5, 20, 500, false, true),
];

function event(
  agentName: string,
  signature: string,
  slot: number,
  eventName: "Spent" | "Claimed" | "Deposited" | "ScoreComputed" | "AgentInitialized",
  payload: Record<string, unknown>,
): EventRow {
  return {
    signature,
    log_index: 0,
    slot,
    program_id: eventName === "ScoreComputed" || eventName === "AgentInitialized"
      ? "Rep1111111111111111111111111111111111111111"
      : "Vau1111111111111111111111111111111111111111",
    event_name: eventName,
    payload: { agent: agentName, ...payload },
    received_at: NOW,
  };
}

export const MOCK_EVENTS: ReadonlyArray<EventRow> = [
  event(MOCK_AGENTS[0]!.pubkey, "5dQ9wK3p", SLOT - 4,   "Spent",         { service: "Pyth",        amount_usdc: 4200 }),
  event(MOCK_AGENTS[3]!.pubkey, "2nR7bL8m", SLOT - 14,  "Spent",         { service: "JitoRPC",     amount_usdc: 21000 }),
  event(MOCK_AGENTS[0]!.pubkey, "9kT4mP1q", SLOT - 22,  "Spent",         { service: "HelixData",   amount_usdc: 18800 }),
  event(MOCK_AGENTS[3]!.pubkey, "1vB6xC9r", SLOT - 36,  "Claimed",       { service: "Cortex",      amount_usdc: 14_220_000 }),
  event(MOCK_AGENTS[1]!.pubkey, "8nM2wQ4t", SLOT - 48,  "Spent",         { service: "Jupiter",     amount_usdc: 6400 }),
  event(MOCK_AGENTS[0]!.pubkey, "score-1",  SLOT - 76,  "ScoreComputed", { score: 947 }),
  event(MOCK_AGENTS[2]!.pubkey, "3rT9pK2v", SLOT - 104, "Spent",         { service: "ArweaveGate", amount_usdc: 2100 }),
  event(MOCK_AGENTS[0]!.pubkey, "7wL3nM8b", SLOT - 142, "Spent",         { service: "Pyth",        amount_usdc: 4200 }),
  event(MOCK_AGENTS[3]!.pubkey, "4xC1vR6s", SLOT - 176, "Deposited",     { amount_usdc: 2_000_000_000 }),
  event(MOCK_AGENTS[1]!.pubkey, "6yU8mP3w", SLOT - 264, "Spent",         { service: "OrcaSwap",    amount_usdc: 9800 }),
  event(MOCK_AGENTS[4]!.pubkey, "score-2",  SLOT - 322, "ScoreComputed", { score: 421 }),
  event(MOCK_AGENTS[0]!.pubkey, "5dF2kL9n", SLOT - 376, "Spent",         { service: "Helius",      amount_usdc: 12400 }),
  event(MOCK_AGENTS[0]!.pubkey, "1aZ7bM4x", SLOT - 428, "Claimed",       { service: "Cortex",      amount_usdc: 8_040_000 }),
];

/** Mimics the backend's cursor pagination by returning rows below `before_slot`. */
export function pageOf<T extends { slot?: number }>(
  items: ReadonlyArray<T>,
  limit: number,
  beforeSlot: number | undefined,
): T[] {
  const filtered = beforeSlot === undefined ? items : items.filter((it) => (it.slot ?? 0) < beforeSlot);
  return [...filtered.slice(0, limit)];
}

export function mockReputation(agentPk: string): ReputationLookup | null {
  const a = MOCK_AGENTS.find((x) => x.pubkey === agentPk);
  if (!a) return null;
  return {
    agent: a.pubkey,
    score: a.score === 0 ? null : a.score,
    total_transactions: a.total_transactions,
    total_volume_usdc: a.total_volume_usdc,
    services_used: a.services_used,
    consecutive_success: a.consecutive_success,
    total_feedback_count: a.total_feedback_count,
    active_negative_feedback_count: a.active_negative_feedback_count,
    last_active_slot: a.last_active_slot,
    updated_at: a.updated_at,
  };
}

export function mockScoreHistory(agentPk: string): ScorePoint[] {
  const a = MOCK_AGENTS.find((x) => x.pubkey === agentPk);
  if (!a || a.score === 0) return [];
  const rows: ScorePoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const wobble = Math.sin(i / 4) * 12 + (i % 3) * -3;
    const score = Math.max(0, Math.min(1000, Math.round(a.score - i * 4 + wobble)));
    rows.push({ score, slot: SLOT - i * 12_000, recorded_at: NOW });
  }
  return rows;
}

export function mockSiwsNonce(pubkey: string): SiwsNonceResponse {
  const nonce = Math.random().toString(16).slice(2, 18).padEnd(16, "0");
  const issued = new Date();
  const expires = new Date(issued.getTime() + 5 * 60_000);
  const message = [
    "agent-fuel.local wants you to sign in with your Solana account:",
    pubkey,
    "",
    "Sign in to manage your Agent Fuel agents and vaults.",
    "",
    "URI: https://agent-fuel.local",
    "Version: 1",
    "Chain ID: solana:devnet",
    `Nonce: ${nonce}`,
    `Issued At: ${issued.toISOString()}`,
    `Expiration Time: ${expires.toISOString()}`,
  ].join("\n");
  return { nonce, message, issued_at: issued.toISOString(), expires_at: expires.toISOString() };
}

export function mockSiwsVerify(): SiwsVerifyResponse {
  const expires = new Date(Date.now() + 60 * 60_000);
  return { token: "mock-jwt-token", expires_at: expires.toISOString() };
}
