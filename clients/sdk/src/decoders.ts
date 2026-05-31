import { PublicKey } from "@solana/web3.js";
import type BN from "bn.js";
import type {
  RawCreditVault,
  RawPendingSpend,
  RawServiceRegistry,
  RawSpendPolicy,
} from "./programs.js";
import type {
  CreditVaultAccount,
  PendingSpendAccount,
  ServiceCategory,
  ServiceRegistryAccount,
  SpendPolicyAccount,
} from "./types.js";

// Anchor returns u64 fields as BN. `.toNumber()` throws above 2^53-1, which is
// the safe behaviour for token amounts and slot numbers under realistic bounds.
function bnToNum(bn: BN): number {
  return bn.toNumber();
}

function nameFromBytes(bytes: number[]): string {
  const buf = Buffer.from(bytes);
  const end = buf.indexOf(0);
  return (end === -1 ? buf : buf.subarray(0, end)).toString("utf8");
}

function categoryFromRaw(raw: RawServiceRegistry["category"]): ServiceCategory {
  if ("dataFeed" in raw) return "DataFeed";
  if ("compute" in raw) return "Compute";
  if ("swap" in raw) return "Swap";
  if ("rpc" in raw) return "Rpc";
  return "Other";
}

export function decodeCreditVault(pubkey: PublicKey, raw: RawCreditVault): CreditVaultAccount {
  const total_deposited = bnToNum(raw.totalDeposited);
  const total_withdrawn = bnToNum(raw.totalWithdrawn);
  const total_spent = bnToNum(raw.totalSpent);
  const total_claimed = bnToNum(raw.totalClaimed);
  return {
    pubkey,
    owner: raw.owner,
    agent: raw.agent,
    usdc_mint: raw.usdcMint,
    vault_token_account: raw.vaultTokenAccount,
    total_deposited,
    total_withdrawn,
    total_spent,
    total_claimed,
    balance: total_deposited - total_withdrawn - total_spent + total_claimed,
    frozen: raw.frozen,
    created_slot: bnToNum(raw.createdSlot),
    last_active_slot: bnToNum(raw.lastActiveSlot),
    pending_count: bnToNum(raw.pendingCount),
  };
}

export function decodePendingSpend(
  pubkey: PublicKey,
  raw: RawPendingSpend,
): PendingSpendAccount {
  return {
    pubkey,
    vault: raw.vault,
    agent: raw.agent,
    service: raw.service,
    amount_usdc: bnToNum(raw.amountUsdc),
    nonce: bnToNum(raw.nonce),
    requested_slot: bnToNum(raw.requestedSlot),
  };
}

const DEFAULT_PUBKEY = PublicKey.default.toBase58();

export function decodeSpendPolicy(pubkey: PublicKey, raw: RawSpendPolicy): SpendPolicyAccount {
  return {
    pubkey,
    vault: raw.vault,
    whitelist: raw.whitelist.filter((pk) => pk.toBase58() !== DEFAULT_PUBKEY),
    per_tx_limit_usdc: bnToNum(raw.perTxLimitUsdc),
    hourly_limit_usdc: bnToNum(raw.hourlyLimitUsdc),
    lifetime_limit_usdc: bnToNum(raw.lifetimeLimitUsdc),
    hourly_window_start_slot: bnToNum(raw.hourlyWindowStartSlot),
    hourly_window_spent_usdc: bnToNum(raw.hourlyWindowSpentUsdc),
    allow_post_pay: raw.allowPostPay,
  };
}

export function decodeServiceRegistry(
  pubkey: PublicKey,
  raw: RawServiceRegistry,
): ServiceRegistryAccount {
  return {
    pubkey,
    authority: raw.authority,
    name: nameFromBytes(raw.name),
    category: categoryFromRaw(raw.category),
    total_agents_served: bnToNum(raw.totalAgentsServed),
    total_volume_received_usdc: bnToNum(raw.totalVolumeReceivedUsdc),
    active: raw.active,
    first_active_slot: bnToNum(raw.firstActiveSlot),
    last_active_slot: bnToNum(raw.lastActiveSlot),
  };
}
