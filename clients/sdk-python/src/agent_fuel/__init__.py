"""Agent Fuel Python SDK — credit vault + reputation primitives for AI agents
on Solana.

Slice 2 (this release): action methods land — `pay` (atomic spend +
record_payment + compute_score), `request_spend` (over-limit flow),
`register_service` (two-signer registration). Slice 3 adds live event
subscriptions + the x402 fetch wrapper.
"""

from __future__ import annotations

from .client import AgentFuel, Cluster, DEFAULT_API_BASE, VaultRef
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
from .spl_token import (
    create_associated_token_account_idempotent_instruction,
    get_associated_token_address,
)
from .types import (
    AgentProfileAccount,
    CreditVaultAccount,
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

__version__ = "0.2.0"

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
    "NotWhitelistedError",
    "OwnerNotConfiguredError",
    "PayResult",
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
    "TOKEN_PROGRAM_ID",
    "VaultFrozenError",
    "VaultRef",
    "ZeroAmountError",
    "__version__",
    "agent_profile_pda",
    "agent_service_link_pda",
    "anchor_discriminator",
    "compute_score_ix",
    "create_associated_token_account_idempotent_instruction",
    "decode_agent_profile",
    "decode_credit_vault",
    "decode_pending_spend",
    "decode_service_registry",
    "decode_spend_policy",
    "get_associated_token_address",
    "pay",
    "pending_spend_pda",
    "policy_pda",
    "receipt_used_pda",
    "record_payment_ix",
    "register_service",
    "register_service_ix",
    "request_spend",
    "request_spend_ix",
    "service_registry_pda",
    "spend_ix",
    "to_pubkey",
    "vault_pda",
]
