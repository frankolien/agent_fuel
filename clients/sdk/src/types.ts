import type { PublicKey } from "@solana/web3.js";

export type Pubkeyish = PublicKey | string;

export type CreditVaultAccount = {
  pubkey: PublicKey;
  owner: PublicKey;
  agent: PublicKey;
  usdc_mint: PublicKey;
  vault_token_account: PublicKey;
  total_deposited: number;
  total_withdrawn: number;
  total_spent: number;
  total_claimed: number;
  // Derived: total_deposited - total_withdrawn - total_spent + total_claimed.
  // Mirrors `vaultBalance()` in the web client.
  balance: number;
  frozen: boolean;
  created_slot: number;
  last_active_slot: number;
  // Monotonic nonce for the next `request_spend` — every over-limit request
  // takes this value, then bumps it. Lets callers derive the PendingSpend
  // PDA without an extra round-trip.
  pending_count: number;
};

export type PendingSpendAccount = {
  pubkey: PublicKey;
  vault: PublicKey;
  agent: PublicKey;
  service: PublicKey;
  amount_usdc: number;
  nonce: number;
  requested_slot: number;
};

export type SpendPolicyAccount = {
  pubkey: PublicKey;
  vault: PublicKey;
  // Default-pubkey padding stripped: an empty array means "no whitelist enforcement"
  // per `check_whitelist` in programs/credit_vault/src/policy.rs.
  whitelist: PublicKey[];
  per_tx_limit_usdc: number;
  hourly_limit_usdc: number;
  lifetime_limit_usdc: number;
  hourly_window_start_slot: number;
  hourly_window_spent_usdc: number;
  allow_post_pay: boolean;
};

export type ServiceCategory = "DataFeed" | "Compute" | "Swap" | "Rpc" | "Other";

export type ServiceRegistryAccount = {
  pubkey: PublicKey;
  authority: PublicKey;
  name: string;
  category: ServiceCategory;
  total_agents_served: number;
  total_volume_received_usdc: number;
  active: boolean;
  first_active_slot: number;
  last_active_slot: number;
};

// Wire format matches the backend's `ws_hub::broadcast_events` frame and the
// web client's `LiveEventFrame`. The SDK forwards backend frames verbatim;
// callers that want typed payloads can narrow on `event_name`.
export type LiveEventFrame = {
  type: "event";
  signature: string;
  log_index: number;
  slot: number;
  program_id: string;
  event_name: string;
  payload: Record<string, unknown>;
};

export type LiveStatus = "connecting" | "open" | "reconnecting" | "closed";

export type Subscription = {
  close(): void;
  readonly status: LiveStatus;
};

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
