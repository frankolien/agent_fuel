// Response shapes for the Actix-Web backend (see backend/src/routes/api/).
// Numeric fields that are u64 on chain (lamports / micro-USDC counters) are
// represented as `number` here — JS safe-integer limit is 2^53, which covers
// every legitimate USDC value by orders of magnitude. If we ever need to read
// raw lamports for SOL totals we'll swap those specific fields to `string`.

export type Agent = {
  pubkey: string;
  owner: string;
  /** null when `compute_score` has never run for this agent. */
  score: number | null;
  total_transactions: number;
  total_volume_usdc: number;
  services_used: number;
  consecutive_success: number;
  total_feedback_count: number;
  active_negative_feedback_count: number;
  first_active_slot: number;
  last_active_slot: number;
  updated_at: string;
};

export type VaultPolicy = {
  per_tx_limit_usdc: number;
  per_hour_limit_usdc: number;
  lifetime_limit_usdc: number;
  allow_post_pay: boolean;
  whitelist: string[];
};

export type Vault = {
  pubkey: string;
  owner: string;
  agent: string;
  balance_usdc: number;
  total_spent: number;
  hourly_used_usdc: number;
  frozen: boolean;
  last_budget_alert_pct: number;
  policy: VaultPolicy;
  updated_at: string;
};

export type EventRow = {
  signature: string;
  log_index: number;
  slot: number;
  program_id: string;
  event_name: string;
  payload: Record<string, unknown>;
};

export type ScoreHistoryRow = {
  agent: string;
  score: number;
  slot: number;
  recorded_at: string;
};

export type Page<T> = {
  items: T[];
  /** Pass back as `?before_slot=` for the next page. `null` when no more rows. */
  next_before_slot: number | null;
};

export type ReputationLookup = {
  score: number | null;
  total_transactions: number;
  total_volume_usdc: number;
  services_used: number;
  consecutive_success: number;
  total_feedback_count: number;
  active_negative_feedback_count: number;
  last_active_slot: number | null;
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

/** Frame shape pushed over `/ws/agents/:pk`. */
export type LiveEventFrame = {
  type: "event";
  signature: string;
  log_index: number;
  slot: number;
  program_id: string;
  event_name: string;
  payload: Record<string, unknown>;
};
