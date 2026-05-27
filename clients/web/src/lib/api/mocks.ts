// Seeded data for the `VITE_USE_MOCKS=1` path. Values mirror the Console
// design's data.jsx so the UI looks the same whether the backend is up or not.

import type {
  Agent,
  EventRow,
  Page,
  ReputationLookup,
  ScoreHistoryRow,
  SiwsNonceResponse,
  SiwsVerifyResponse,
  Vault,
} from "@/types/api";

const OWNER = "ownE7r9kN3mB7vZ4xC2tL5wY8sE6dF1gA9uN7bMcXrJp1Q";
const NOW = "2026-05-27T00:00:00Z";
const SLOT = 287_540_312;

function agent(
  pubkey: string,
  score: number | null,
  txs: number,
  volume: number,
  services: number,
  streak: number,
): Agent {
  return {
    pubkey,
    owner: OWNER,
    score,
    total_transactions: txs,
    total_volume_usdc: Math.round(volume * 1_000_000),
    services_used: services,
    consecutive_success: streak,
    total_feedback_count: Math.floor(txs / 100),
    active_negative_feedback_count: score === null ? 0 : Math.max(0, Math.floor((1000 - score) / 50)),
    first_active_slot: SLOT - 5_000_000,
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
  agent("SaBl3MeV6wKvP3nM4bZ8rT5jL2sE7dY9gA4uN1bMcXrQVx", null, 0, 0, 0, 0),
];

function vault(
  pubkey: string,
  agentPk: string,
  balance: number,
  spent: number,
  perTx: number,
  perHour: number,
  hourly: number,
  ceiling: number,
  postPay: boolean,
  frozen: boolean,
  whitelistCount: number,
  budgetAlert = 0,
): Vault {
  const whitelist: string[] = [];
  for (let i = 0; i < whitelistCount; i++) {
    whitelist.push(`svc${i + 1}……`);
  }
  return {
    pubkey,
    owner: OWNER,
    agent: agentPk,
    balance_usdc: Math.round(balance * 1_000_000),
    total_spent: Math.round(spent * 1_000_000),
    hourly_used_usdc: Math.round(hourly * 1_000_000),
    frozen,
    last_budget_alert_pct: budgetAlert,
    policy: {
      per_tx_limit_usdc: Math.round(perTx * 1_000_000),
      per_hour_limit_usdc: Math.round(perHour * 1_000_000),
      lifetime_limit_usdc: Math.round(ceiling * 1_000_000),
      allow_post_pay: postPay,
      whitelist,
    },
    updated_at: NOW,
  };
}

export const MOCK_VAULTS: ReadonlyArray<Vault> = [
  vault("vAuLtAtL5s9MmK3vN8bZ4xC7tL2pQ7vK1mY3jL6wE9dF2g", MOCK_AGENTS[0]!.pubkey, 1872.58, 3127.42, 25, 240, 87.12, 5000, true, false, 6, 70),
  vault("vAuLtOrCh4rd2pQ7vK1mY3jL5tH6wE9dF2gA4uN8bMcXrZ", MOCK_AGENTS[1]!.pubkey, 597.9, 1402.1, 10, 120, 52.4, 2000, true, false, 4),
  vault("vAuLtKePl3R7wKvP3nM4bZ6rT5jL8sE1dY9gA4uN2bMcXr", MOCK_AGENTS[2]!.pubkey, 887.7, 612.3, 8, 60, 38.7, 1500, false, false, 9),
  vault("vAuLtVgA2sEttl6wKvP3nM4bZ8rT5jL2sE7dY9gA4uN1bM", MOCK_AGENTS[3]!.pubkey, 3888.12, 4111.88, 50, 800, 320, 8000, true, false, 3),
  vault("vAuLtLuM3nN8sR2pQ7vK1mY3jL5tH6wE9dF2gA4uN8bMcX", MOCK_AGENTS[4]!.pubkey, 68.8, 681.2, 5, 30, 27.4, 750, false, false, 5, 90),
  vault("vAuLtSaBl3MeV6wKvP3nM4bZ8rT5jL2sE7dY9gA4uN1bMc", MOCK_AGENTS[5]!.pubkey, 500, 0, 5, 20, 0, 500, false, true, 2),
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
  };
}

export const MOCK_EVENTS: ReadonlyArray<EventRow> = [
  event(MOCK_AGENTS[0]!.pubkey, "5dQ9wK3p", SLOT - 4,   "Spent",         { service: "Pyth",       amount_usdc: 4200 }),
  event(MOCK_AGENTS[3]!.pubkey, "2nR7bL8m", SLOT - 14,  "Spent",         { service: "JitoRPC",    amount_usdc: 21000 }),
  event(MOCK_AGENTS[0]!.pubkey, "9kT4mP1q", SLOT - 22,  "Spent",         { service: "HelixData",  amount_usdc: 18800 }),
  event(MOCK_AGENTS[3]!.pubkey, "1vB6xC9r", SLOT - 36,  "Claimed",       { service: "Cortex",     amount_usdc: 14_220_000 }),
  event(MOCK_AGENTS[1]!.pubkey, "8nM2wQ4t", SLOT - 48,  "Spent",         { service: "Jupiter",    amount_usdc: 6400 }),
  event(MOCK_AGENTS[0]!.pubkey, "score-1",  SLOT - 76,  "ScoreComputed", { score: 947 }),
  event(MOCK_AGENTS[2]!.pubkey, "3rT9pK2v", SLOT - 104, "Spent",         { service: "ArweaveGate", amount_usdc: 2100 }),
  event(MOCK_AGENTS[0]!.pubkey, "7wL3nM8b", SLOT - 142, "Spent",         { service: "Pyth",       amount_usdc: 4200 }),
  event(MOCK_AGENTS[3]!.pubkey, "4xC1vR6s", SLOT - 176, "Deposited",     { amount_usdc: 2_000_000_000 }),
  event(MOCK_AGENTS[1]!.pubkey, "6yU8mP3w", SLOT - 264, "Spent",         { service: "OrcaSwap",   amount_usdc: 9800 }),
  event(MOCK_AGENTS[4]!.pubkey, "score-2",  SLOT - 322, "ScoreComputed", { score: 421 }),
  event(MOCK_AGENTS[0]!.pubkey, "5dF2kL9n", SLOT - 376, "Spent",         { service: "Helius",     amount_usdc: 12400 }),
  event(MOCK_AGENTS[0]!.pubkey, "1aZ7bM4x", SLOT - 428, "Claimed",       { service: "Cortex",     amount_usdc: 8_040_000 }),
];

export function pageOf<T extends { slot?: number }>(
  items: ReadonlyArray<T>,
  limit: number,
  beforeSlot: number | undefined,
): Page<T> {
  const filtered = beforeSlot === undefined ? items : items.filter((it) => (it.slot ?? 0) < beforeSlot);
  const slice = filtered.slice(0, limit);
  const last = slice[slice.length - 1];
  const next = slice.length < filtered.length && last?.slot !== undefined ? last.slot : null;
  return { items: [...slice], next_before_slot: next };
}

export function mockReputation(agentPk: string): ReputationLookup | null {
  const a = MOCK_AGENTS.find((x) => x.pubkey === agentPk);
  if (!a) return null;
  return {
    score: a.score,
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

export function mockScoreHistory(agentPk: string): ScoreHistoryRow[] {
  const a = MOCK_AGENTS.find((x) => x.pubkey === agentPk);
  if (!a || a.score === null) return [];
  // Synthesize a 30-point history converging on the current score.
  const rows: ScoreHistoryRow[] = [];
  for (let i = 29; i >= 0; i--) {
    const wobble = Math.sin(i / 4) * 12 + (i % 3) * -3;
    const score = Math.max(0, Math.min(1000, Math.round(a.score! - i * 4 + wobble)));
    rows.push({
      agent: agentPk,
      score,
      slot: SLOT - i * 12_000,
      recorded_at: NOW,
    });
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
