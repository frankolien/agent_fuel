from __future__ import annotations

import re
from typing import TYPE_CHECKING

from .errors import (
    AgentFuelError,
    HourlyLimitExceededError,
    LifetimeLimitExceededError,
    NotWhitelistedError,
    PerTxLimitExceededError,
    ReceiptAlreadyRecordedError,
    RecordPaymentError,
    ServiceInactiveError,
    VaultFrozenError,
    ZeroAmountError,
)

if TYPE_CHECKING:
    from solders.pubkey import Pubkey

    from .types import CreditVaultAccount, SpendPolicyAccount

# credit_vault error codes (programs/credit_vault/src/errors.rs).
# Anchor starts custom errors at 6000 — these match the TS SDK's
# mapSpendError() in clients/sdk/src/client.ts so a single `except
# SpendPolicyError` works regardless of language.
_VAULT_ZERO_AMOUNT = 6001
_VAULT_FROZEN = 6002
_VAULT_NOT_WHITELISTED = 6003
_VAULT_PER_TX_LIMIT = 6004
_VAULT_HOURLY_LIMIT = 6005
_VAULT_LIFETIME_LIMIT = 6006

# reputation error codes (programs/reputation/src/errors.rs).
_REP_COUNTER_OVERFLOW = 6000
_REP_SERVICE_INACTIVE = 6011

# Account-already-in-use is a Solana-level error (System program) raised when
# `record_payment` tries to init a `ReceiptUsed` PDA that already exists —
# the anti-replay defence. Surface it as the typed receipt error.
_RECEIPT_REUSE_MARKERS = ("already in use", "0x0")

# Anchor surfaces program errors via simulation as either:
#   "custom program error: 0x1771"    (hex code, transient SDK format)
#   "Custom error: 1771"               (older Anchor)
#   "Error Code: VaultFrozen. Error Number: 6002. ..."  (verbose)
# We grep for any decimal or 0x-prefixed integer near the keyword "custom"
# / "error" and try them all.
_ERROR_CODE_RE = re.compile(r"(?:0x([0-9a-fA-F]+))|(?:\b(\d{4,5})\b)")


def extract_error_codes(message: str) -> list[int]:
    """Pull every plausible 4-5 digit decimal or 4-5 digit hex code out of
    an RPC simulation / send error string. Order-preserving — the *first*
    Anchor code is usually the one that fired (later codes can show up in
    stack traces of nested CPI calls)."""
    codes: list[int] = []
    for match in _ERROR_CODE_RE.finditer(message):
        hex_part, dec_part = match.group(1), match.group(2)
        if hex_part is not None:
            try:
                codes.append(int(hex_part, 16))
            except ValueError:
                continue
        elif dec_part is not None:
            try:
                codes.append(int(dec_part))
            except ValueError:
                continue
    return codes


def map_spend_error(
    err: Exception,
    *,
    service: Pubkey,
    amount_usdc: int,
    vault: CreditVaultAccount,
    policy: SpendPolicyAccount,
) -> Exception:
    """Rewrite RPC / simulation errors raised by `spend` (or the spend
    half of `pay` / approve_spend) into the same typed exceptions the
    local guardrail throws — so callers branch on type, not text."""
    # Bare module-level constants can't be used as `case` patterns (Python
    # treats them as capture targets, not value comparisons), so the
    # mapping is an if/elif chain on each candidate code.
    message = str(err)
    for code in extract_error_codes(message):
        if code == _VAULT_ZERO_AMOUNT:
            return ZeroAmountError()
        if code == _VAULT_FROZEN:
            return VaultFrozenError()
        if code == _VAULT_NOT_WHITELISTED:
            return NotWhitelistedError(str(service))
        if code == _VAULT_PER_TX_LIMIT:
            return PerTxLimitExceededError(amount_usdc, policy.per_tx_limit_usdc)
        if code == _VAULT_HOURLY_LIMIT:
            return HourlyLimitExceededError(
                amount_usdc, policy.hourly_window_spent_usdc, policy.hourly_limit_usdc
            )
        if code == _VAULT_LIFETIME_LIMIT:
            return LifetimeLimitExceededError(
                amount_usdc, vault.total_spent, policy.lifetime_limit_usdc
            )
    return err


def map_pay_error(
    err: Exception,
    *,
    service: Pubkey,
    amount_usdc: int,
    receipt_hash: bytes,
    vault: CreditVaultAccount,
    policy: SpendPolicyAccount,
) -> Exception:
    """Same as `map_spend_error` but also catches the receipt-replay and
    service-inactive cases that only appear via the reputation half of
    the atomic transaction."""
    message = str(err)
    lower = message.lower()
    if any(marker in lower for marker in _RECEIPT_REUSE_MARKERS):
        # Account-already-in-use during init = receipt collision (we only
        # init one account during pay() — the ReceiptUsed PDA).
        return ReceiptAlreadyRecordedError(receipt_hash)
    for code in extract_error_codes(message):
        if code == _REP_SERVICE_INACTIVE:
            return ServiceInactiveError(str(service))
        if code == _REP_COUNTER_OVERFLOW:
            return RecordPaymentError("counter overflow on chain")
    return map_spend_error(
        err, service=service, amount_usdc=amount_usdc, vault=vault, policy=policy
    )


def wrap_unknown(err: Exception) -> Exception:
    """Default escape hatch — keep the original traceback but surface as
    an `AgentFuelError` so callers can `except AgentFuelError` at the
    boundary without leaking RPC client types."""
    if isinstance(err, AgentFuelError):
        return err
    return AgentFuelError(str(err))
