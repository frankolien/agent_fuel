from __future__ import annotations


class AgentFuelError(Exception):
    """Base for every SDK-thrown error."""


class OwnerNotConfiguredError(AgentFuelError):
    def __init__(self) -> None:
        super().__init__(
            "vault owner is not configured: pass `owner=` to `AgentFuel(...)` or to the method"
        )


class AccountNotFoundError(AgentFuelError):
    def __init__(self, account: str) -> None:
        super().__init__(f"account not found: {account}")
        self.account = account


class HttpError(AgentFuelError):
    def __init__(self, status: int, url: str, body: str | None = None) -> None:
        super().__init__(f"HTTP {status} from {url}")
        self.status = status
        self.url = url
        self.body = body


# Local spend-guardrail errors — mirror the six on-chain `VaultError` variants
# (programs/credit_vault/src/errors.rs) and the TS SDK's `SpendPolicyError`
# hierarchy, so a single `except SpendPolicyError` catches both pre-flight and
# on-chain rejections.
class SpendPolicyError(AgentFuelError):
    """Base for all six policy-guardrail rejections."""


class VaultFrozenError(SpendPolicyError):
    def __init__(self) -> None:
        super().__init__("vault is frozen")


class ZeroAmountError(SpendPolicyError):
    def __init__(self) -> None:
        super().__init__("amount must be greater than zero")


class NotWhitelistedError(SpendPolicyError):
    def __init__(self, service: str) -> None:
        super().__init__(f"service {service} is not whitelisted")
        self.service = service


class PerTxLimitExceededError(SpendPolicyError):
    def __init__(self, attempted: int, limit: int) -> None:
        super().__init__(f"per-tx limit exceeded: attempted {attempted}, limit {limit}")
        self.attempted = attempted
        self.limit = limit


class HourlyLimitExceededError(SpendPolicyError):
    def __init__(self, attempted: int, window_spent: int, limit: int) -> None:
        super().__init__(
            f"hourly limit exceeded: attempted {attempted} + "
            f"window already spent {window_spent}, limit {limit}"
        )
        self.attempted = attempted
        self.window_spent = window_spent
        self.limit = limit


class LifetimeLimitExceededError(SpendPolicyError):
    def __init__(self, attempted: int, total_spent: int, limit: int) -> None:
        super().__init__(
            f"lifetime limit exceeded: attempted {attempted} + "
            f"already spent {total_spent}, limit {limit}"
        )
        self.attempted = attempted
        self.total_spent = total_spent
        self.limit = limit


# record_payment-side errors — only surface via `pay()` once that slice lands.
class RecordPaymentError(AgentFuelError):
    def __init__(self, message: str) -> None:
        super().__init__(f"record_payment failed: {message}")


class ReceiptAlreadyRecordedError(RecordPaymentError):
    def __init__(self, receipt_hash: bytes) -> None:
        super().__init__(f"receipt {receipt_hash.hex()} has already been recorded")
        self.receipt_hash = receipt_hash


class ServiceInactiveError(RecordPaymentError):
    def __init__(self, service: str) -> None:
        super().__init__(f"service {service} is inactive")
        self.service = service
