"""Agent Fuel Python SDK — credit vault + reputation primitives for AI agents
on Solana.

Slice 3 (this release): live event subscriptions over the backend's
WebSocket hub (`fuel.on_event`, `fuel.on_service_event`,
`fuel.on_vault_event`) and the x402 fetch wrapper
(`fuel.payment_required()`) that auto-pays on HTTP 402. Also exposes
the standalone `spend()` (no receipt, no reputation event) for x402
payments to recipients that aren't registered as services.
"""

from __future__ import annotations

from .client import DEFAULT_API_BASE, AgentFuel, Cluster, VaultRef
from .constants import (
    ASSOCIATED_TOKEN_PROGRAM_ID,
    CREDIT_VAULT_PROGRAM_ID,
    REPUTATION_PROGRAM_ID,
    SLOTS_PER_HOUR,
    TOKEN_PROGRAM_ID,
)
from .errors import (
    AccountNotFoundError,
    AgentFuelError,
    HourlyLimitExceededError,
    HttpError,
    LifetimeLimitExceededError,
    NotWhitelistedError,
    OwnerNotConfiguredError,
    PerTxLimitExceededError,
    ReceiptAlreadyRecordedError,
    RecordPaymentError,
    ServiceInactiveError,
    SpendPolicyError,
    VaultFrozenError,
    ZeroAmountError,
)
from .instructions import (
    anchor_discriminator,
    compute_score_ix,
    record_payment_ix,
    register_service_ix,
    request_spend_ix,
    spend_ix,
)
from .live import Subscription, channel_url, subscribe, ws_url
from .pay import PayResult, pay
from .pda import (
    Pubkeyish,
    agent_profile_pda,
    agent_service_link_pda,
    pending_spend_pda,
    policy_pda,
    receipt_used_pda,
    service_registry_pda,
    to_pubkey,
    vault_pda,
)
from .register_service import RegisterServiceResult, register_service
from .request_spend import RequestSpendResult, request_spend
from .spend import SpendResult, spend
from .spl_token import (
    create_associated_token_account_idempotent_instruction,
    get_associated_token_address,
)
from .types import (
    AgentProfileAccount,
    CreditVaultAccount,
    LiveEventFrame,
    LiveStatus,
    PendingSpendAccount,
    ReputationLookup,
    ServiceCategory,
    ServiceRegistryAccount,
    SpendPolicyAccount,
    decode_agent_profile,
    decode_credit_vault,
    decode_pending_spend,
    decode_service_registry,
    decode_spend_policy,
)
from .x402 import (
    PaymentParseError,
    PaymentRequiredFetcher,
    PaymentRequirement,
    payment_required,
)

__version__ = "0.3.0"

__all__ = [
    "AgentFuel",
    "AgentFuelError",
    "AccountNotFoundError",
    "AgentProfileAccount",
    "ASSOCIATED_TOKEN_PROGRAM_ID",
    "Cluster",
    "CREDIT_VAULT_PROGRAM_ID",
    "CreditVaultAccount",
    "DEFAULT_API_BASE",
    "HourlyLimitExceededError",
    "HttpError",
    "LifetimeLimitExceededError",
    "LiveEventFrame",
    "LiveStatus",
    "NotWhitelistedError",
    "OwnerNotConfiguredError",
    "PayResult",
    "PaymentParseError",
    "PaymentRequiredFetcher",
    "PaymentRequirement",
    "PendingSpendAccount",
    "PerTxLimitExceededError",
    "Pubkeyish",
    "ReceiptAlreadyRecordedError",
    "RecordPaymentError",
    "RegisterServiceResult",
    "REPUTATION_PROGRAM_ID",
    "ReputationLookup",
    "RequestSpendResult",
    "ServiceCategory",
    "ServiceInactiveError",
    "ServiceRegistryAccount",
    "SLOTS_PER_HOUR",
    "SpendPolicyAccount",
    "SpendPolicyError",
    "SpendResult",
    "Subscription",
    "TOKEN_PROGRAM_ID",
    "VaultFrozenError",
    "VaultRef",
    "ZeroAmountError",
    "__version__",
    "agent_profile_pda",
    "agent_service_link_pda",
    "anchor_discriminator",
    "channel_url",
    "compute_score_ix",
    "create_associated_token_account_idempotent_instruction",
    "decode_agent_profile",
    "decode_credit_vault",
    "decode_pending_spend",
    "decode_service_registry",
    "decode_spend_policy",
    "get_associated_token_address",
    "pay",
    "payment_required",
    "pending_spend_pda",
    "policy_pda",
    "receipt_used_pda",
    "record_payment_ix",
    "register_service",
    "register_service_ix",
    "request_spend",
    "request_spend_ix",
    "service_registry_pda",
    "spend",
    "spend_ix",
    "subscribe",
    "to_pubkey",
    "vault_pda",
    "ws_url",
]
