"""Agent Fuel Python SDK — credit vault + reputation primitives for AI agents
on Solana.

Slice 1 (this release): read methods (`get_score`, `get_vault_balance`,
`get_policy`, `check_service`). Action methods (`pay`, `request_spend`,
`register_service`), live event subscriptions, and the x402 fetch wrapper
land in subsequent slices.
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

__version__ = "0.1.0"

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
    "PendingSpendAccount",
    "PerTxLimitExceededError",
    "Pubkeyish",
    "ReceiptAlreadyRecordedError",
    "RecordPaymentError",
    "REPUTATION_PROGRAM_ID",
    "ReputationLookup",
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
    "decode_agent_profile",
    "decode_credit_vault",
    "decode_pending_spend",
    "decode_service_registry",
    "decode_spend_policy",
    "pending_spend_pda",
    "policy_pda",
    "receipt_used_pda",
    "service_registry_pda",
    "to_pubkey",
    "vault_pda",
]
