"""Local mirror of `check_and_record_spend` from
programs/credit_vault/src/policy.rs. Catches the obvious failures
(frozen, zero, whitelist, per-tx, hourly, lifetime) before we burn a
transaction slot — but the on-chain ladder is authoritative; this is a
pre-flight courtesy."""

from __future__ import annotations

from solders.pubkey import Pubkey

from .constants import SLOTS_PER_HOUR
from .errors import (
    HourlyLimitExceededError,
    LifetimeLimitExceededError,
    NotWhitelistedError,
    PerTxLimitExceededError,
    VaultFrozenError,
    ZeroAmountError,
)
from .types import CreditVaultAccount, SpendPolicyAccount


def guard_spend(
    *,
    vault: CreditVaultAccount,
    policy: SpendPolicyAccount,
    service: Pubkey,
    amount_usdc: int,
    current_slot: int,
) -> None:
    if vault.frozen:
        raise VaultFrozenError()
    if amount_usdc <= 0:
        raise ZeroAmountError()
    if policy.whitelist and service not in policy.whitelist:
        raise NotWhitelistedError(str(service))
    # On-chain semantics (programs/credit_vault/src/policy.rs): a limit of
    # `0` means "no enforcement", not "zero allowed". Each check is gated
    # on `if policy.X_limit_usdc > 0`. Mirror that here or this guardrail
    # rejects every spend on an unlimited policy.
    if policy.per_tx_limit_usdc > 0 and amount_usdc > policy.per_tx_limit_usdc:
        raise PerTxLimitExceededError(amount_usdc, policy.per_tx_limit_usdc)
    # Hourly window slides every SLOTS_PER_HOUR slots. Spent counter resets
    # on chain when a new window opens; mirror that here so a stale value
    # from a closed window doesn't trip a false-positive rejection.
    if policy.hourly_limit_usdc > 0:
        window_spent = policy.hourly_window_spent_usdc
        if current_slot - policy.hourly_window_start_slot >= SLOTS_PER_HOUR:
            window_spent = 0
        if amount_usdc + window_spent > policy.hourly_limit_usdc:
            raise HourlyLimitExceededError(
                amount_usdc, window_spent, policy.hourly_limit_usdc
            )
    if (
        policy.lifetime_limit_usdc > 0
        and amount_usdc + vault.total_spent > policy.lifetime_limit_usdc
    ):
        raise LifetimeLimitExceededError(
            amount_usdc, vault.total_spent, policy.lifetime_limit_usdc
        )
