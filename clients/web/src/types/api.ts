// Response shapes for the Actix-Web backend. Mirrored 1:1 from
// `backend/src/routes/api/*.rs` — if you change a column there, change it here.
//
// Numeric fields stored as u64/i64 on the server (lamports / micro-USDC counters)
// arrive as `number` because Actix serialises them as JSON numbers. JS safe-integer
// limit is 2^53, which covers every legitimate USDC value by orders of magnitude.

export type Agent = {
  pubkey: string;
  owner: string;
  init_slot: number;
  score: number;
  total_transactions: number;
  total_volume_usdc: number;
  services_used: number;
  consecutive_success: number;
  total_feedback_count: number;
  active_negative_feedback_count: number;
  last_active_slot: number;
  updated_at: string;
};

// Flat shape matches `VaultRow` in `backend/src/routes/api/vaults.rs`. The
// "balance" the UI cares about is derived: deposited - withdrawn - spent + claimed.
export type Vault = {
  pubkey: string;
  owner: string;
  agent: string;
  usdc_mint: string;
  vault_token_account: string;
  total_deposited: number;
  total_withdrawn: number;
  total_spent: number;
  total_claimed: number;
  frozen: boolean;
  per_tx_limit_usdc: number;
  hourly_limit_usdc: number;
  lifetime_limit_usdc: number;
  allow_post_pay: boolean;
  /** Base58 service pubkeys; zero-pubkey slots are stripped server-side. */
  whitelist: string[];
  created_slot: number;
  last_active_slot: number;
  updated_at: string;
};

/** Convenience: backend stores them separately; UI almost always wants both. */
export function vaultBalance(vault: Vault): number {
  return vault.total_deposited - vault.total_withdrawn - vault.total_spent + vault.total_claimed;
}

export type Service = {
  pubkey: string;       // service authority (== wallet that registered)
  registry: string;     // ServiceRegistry PDA
  name: string;
  category: "DataFeed" | "Compute" | "Swap" | "Rpc" | "Other";
  total_agents_served: number;
  total_volume_received_usdc: number;
  active: boolean;
  first_active_slot: number;
  last_active_slot: number;
};

export type EventRow = {
  signature: string;
  log_index: number;
  slot: number;
  program_id: string;
  event_name: string;
  payload: Record<string, unknown>;
  received_at: string;
};

export type ScorePoint = {
  score: number;
  slot: number;
  recorded_at: string;
};

// Public reputation lookup keeps `score` nullable — distinguishes
// "compute_score has never run" from "score is 0", per
// `backend/src/routes/reputation.rs::ReputationResponse`.
export type ReputationLookup = {
  agent: string;
  score: number | null;
  total_transactions: number;
  total_volume_usdc: number;
  services_used: number;
  consecutive_success: number;
  total_feedback_count: number;
  active_negative_feedback_count: number;
  last_active_slot: number;
  updated_at: string;
};

export type SiwsNonceResponse = {
  nonce: string;
  message: string;
  issued_at: string;
  expires_at: string;
};

export type SiwsVerifyResponse = {
  token: string;
  expires_at: string;
};

/** Frame shape pushed over `/ws/agents/:pk`. Mirrors the WsFrame in backend ws_hub. */
export type LiveEventFrame = {
  type: "event";
  signature: string;
  log_index: number;
  slot: number;
  program_id: string;
  event_name: string;
  payload: Record<string, unknown>;
};
