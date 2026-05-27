import type { PublicKey } from "@solana/web3.js";
import { SLOTS_PER_HOUR } from "./constants.js";
import {
  HourlyLimitExceededError,
  LifetimeLimitExceededError,
  NotWhitelistedError,
  PerTxLimitExceededError,
  VaultFrozenError,
  ZeroAmountError,
} from "./errors.js";
import type { CreditVaultAccount, SpendPolicyAccount } from "./types.js";

// Mirrors `check_and_record_spend` in programs/credit_vault/src/policy.rs.
// This is a best-effort pre-flight: a concurrent spend, a window roll-over, or
// any other on-chain state change between this check and the transaction
// landing can still cause the chain to reject. The SDK surfaces the on-chain
// error in that case — the local check just avoids the network round-trip for
// the obvious failures.
export function guardSpend(args: {
  vault: CreditVaultAccount;
  policy: SpendPolicyAccount;
  service: PublicKey;
  amountUsdc: number;
  currentSlot: number;
}): void {
  const { vault, policy, service, amountUsdc, currentSlot } = args;

  if (vault.frozen) throw new VaultFrozenError();
  if (amountUsdc <= 0) throw new ZeroAmountError();

  if (policy.whitelist.length > 0) {
    const allowed = policy.whitelist.some((pk) => pk.equals(service));
    if (!allowed) throw new NotWhitelistedError(service.toBase58());
  }

  if (policy.per_tx_limit_usdc > 0 && amountUsdc > policy.per_tx_limit_usdc) {
    throw new PerTxLimitExceededError(amountUsdc, policy.per_tx_limit_usdc);
  }

  if (policy.hourly_limit_usdc > 0) {
    const windowElapsed = currentSlot - policy.hourly_window_start_slot >= SLOTS_PER_HOUR;
    const windowSpent = windowElapsed ? 0 : policy.hourly_window_spent_usdc;
    const newWindowTotal = windowSpent + amountUsdc;
    if (newWindowTotal > policy.hourly_limit_usdc) {
      throw new HourlyLimitExceededError(amountUsdc, windowSpent, policy.hourly_limit_usdc);
    }
  }

  if (policy.lifetime_limit_usdc > 0) {
    const newTotalSpent = vault.total_spent + amountUsdc;
    if (newTotalSpent > policy.lifetime_limit_usdc) {
      throw new LifetimeLimitExceededError(amountUsdc, vault.total_spent, policy.lifetime_limit_usdc);
    }
  }
}
