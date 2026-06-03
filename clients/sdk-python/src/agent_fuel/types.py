from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from construct import (
    Array,
    Bytes,
    Const,
    Flag,
    Int8ub,
    Int16ul,
    Int32ul,
    Int64ul,
    Struct,
)
from solders.pubkey import Pubkey

ServiceCategory = Literal["DataFeed", "Compute", "Swap", "Rpc", "Other"]

# --- Anchor account discriminators (sha256("account:<Name>")[:8]) -----------
# These are the first 8 bytes of every Anchor-owned account; the IDL pins them
# explicitly so a layout change (which moves the discriminator) is caught
# instead of silently mis-decoded.
DISCRIMINATORS = {
    "CreditVault": bytes([143, 180, 135, 248, 84, 85, 183, 70]),
    "SpendPolicy": bytes([139, 90, 209, 31, 205, 15, 68, 243]),
    "PendingSpend": bytes([193, 205, 85, 66, 25, 3, 67, 134]),
    "ServiceRegistry": bytes([105, 133, 96, 79, 207, 176, 202, 67]),
    "AgentProfile": bytes([60, 227, 42, 24, 0, 87, 86, 205]),
}


def _pubkey() -> Bytes:
    return Bytes(32)


# --- On-chain account layouts ----------------------------------------------
# Field order matches programs/credit_vault/src/state.rs and
# programs/reputation/src/state.rs verbatim — Borsh on Solana is positional,
# so any reorder breaks the wire format.

_CREDIT_VAULT_LAYOUT = Struct(
    "_discriminator" / Const(DISCRIMINATORS["CreditVault"]),
    "owner" / _pubkey(),
    "agent" / _pubkey(),
    "usdc_mint" / _pubkey(),
    "vault_token_account" / _pubkey(),
    "total_deposited" / Int64ul,
    "total_withdrawn" / Int64ul,
    "total_spent" / Int64ul,
    "total_claimed" / Int64ul,
    "frozen" / Flag,
    "created_slot" / Int64ul,
    "last_active_slot" / Int64ul,
    "bump" / Int8ub,
    "pending_count" / Int64ul,
    "_padding" / Bytes(56),
)

_SPEND_POLICY_LAYOUT = Struct(
    "_discriminator" / Const(DISCRIMINATORS["SpendPolicy"]),
    "vault" / _pubkey(),
    "whitelist" / Array(8, _pubkey()),
    "per_tx_limit_usdc" / Int64ul,
    "hourly_limit_usdc" / Int64ul,
    "lifetime_limit_usdc" / Int64ul,
    "hourly_window_start_slot" / Int64ul,
    "hourly_window_spent_usdc" / Int64ul,
    "allow_post_pay" / Flag,
    "bump" / Int8ub,
    "_padding" / Bytes(64),
)

_PENDING_SPEND_LAYOUT = Struct(
    "_discriminator" / Const(DISCRIMINATORS["PendingSpend"]),
    "vault" / _pubkey(),
    "agent" / _pubkey(),
    "service" / _pubkey(),
    "amount_usdc" / Int64ul,
    "requested_slot" / Int64ul,
    "nonce" / Int64ul,
    "bump" / Int8ub,
    "_padding" / Bytes(31),
)

_SERVICE_REGISTRY_LAYOUT = Struct(
    "_discriminator" / Const(DISCRIMINATORS["ServiceRegistry"]),
    "authority" / _pubkey(),
    "name" / Bytes(32),
    "service_uri" / Bytes(128),
    "category" / Int8ub,  # Borsh enum variant index (DataFeed=0 .. Other=4)
    "total_agents_served" / Int64ul,
    "total_volume_received_usdc" / Int64ul,
    "active" / Flag,
    "first_active_slot" / Int64ul,
    "last_active_slot" / Int64ul,
    "bump" / Int8ub,
    "_padding" / Bytes(64),
)

_AGENT_PROFILE_LAYOUT = Struct(
    "_discriminator" / Const(DISCRIMINATORS["AgentProfile"]),
    "authority" / _pubkey(),
    "owner" / _pubkey(),
    "agent_uri" / Bytes(128),
    "external_agent_id" / Int64ul,
    "total_transactions" / Int64ul,
    "total_volume_usdc" / Int64ul,
    "consecutive_success" / Int32ul,
    "total_feedback_count" / Int32ul,
    "active_negative_feedback_count" / Int32ul,
    "services_used" / Int16ul,
    "first_active_slot" / Int64ul,
    "last_active_slot" / Int64ul,
    "reputation_score" / Int16ul,
    "bump" / Int8ub,
    "_padding" / Bytes(64),
)


# --- Decoded dataclasses ---------------------------------------------------
# Snake-case, JSON-friendly. Mirror the TS SDK's `CreditVaultAccount` etc. so
# the surface reads identically across languages.

@dataclass(frozen=True)
class CreditVaultAccount:
    pubkey: Pubkey
    owner: Pubkey
    agent: Pubkey
    usdc_mint: Pubkey
    vault_token_account: Pubkey
    total_deposited: int
    total_withdrawn: int
    total_spent: int
    total_claimed: int
    balance: int  # derived: deposited - withdrawn - spent + claimed
    frozen: bool
    created_slot: int
    last_active_slot: int
    pending_count: int


@dataclass(frozen=True)
class SpendPolicyAccount:
    pubkey: Pubkey
    vault: Pubkey
    whitelist: list[Pubkey]  # default-pubkey entries stripped
    per_tx_limit_usdc: int
    hourly_limit_usdc: int
    lifetime_limit_usdc: int
    hourly_window_start_slot: int
    hourly_window_spent_usdc: int
    allow_post_pay: bool


@dataclass(frozen=True)
class PendingSpendAccount:
    pubkey: Pubkey
    vault: Pubkey
    agent: Pubkey
    service: Pubkey
    amount_usdc: int
    nonce: int
    requested_slot: int


@dataclass(frozen=True)
class ServiceRegistryAccount:
    pubkey: Pubkey
    authority: Pubkey
    name: str
    category: ServiceCategory
    total_agents_served: int
    total_volume_received_usdc: int
    active: bool
    first_active_slot: int
    last_active_slot: int


@dataclass(frozen=True)
class AgentProfileAccount:
    pubkey: Pubkey
    authority: Pubkey
    owner: Pubkey
    agent_uri: str
    external_agent_id: int
    total_transactions: int
    total_volume_usdc: int
    consecutive_success: int
    total_feedback_count: int
    active_negative_feedback_count: int
    services_used: int
    first_active_slot: int
    last_active_slot: int
    reputation_score: int


@dataclass(frozen=True)
class ReputationLookup:
    """REST snapshot returned by `GET /reputation/:agent` on the backend.
    `score` is `None` for agents that have never had a `ScoreComputed` event
    indexed (i.e. they exist on chain but haven't been computed)."""

    agent: str
    score: int | None
    total_transactions: int
    total_volume_usdc: int
    services_used: int
    consecutive_success: int
    total_feedback_count: int
    active_negative_feedback_count: int
    last_active_slot: int
    updated_at: str


# --- Decoders --------------------------------------------------------------

_DEFAULT_PUBKEY = Pubkey.default()


def _pk(b: bytes) -> Pubkey:
    return Pubkey.from_bytes(b)


def _utf8_trim(b: bytes) -> str:
    end = b.find(b"\x00")
    return (b if end == -1 else b[:end]).decode("utf-8", errors="replace")


def _category_from_index(i: int) -> ServiceCategory:
    match i:
        case 0:
            return "DataFeed"
        case 1:
            return "Compute"
        case 2:
            return "Swap"
        case 3:
            return "Rpc"
        case _:
            return "Other"


def decode_credit_vault(pubkey: Pubkey, data: bytes) -> CreditVaultAccount:
    r = _CREDIT_VAULT_LAYOUT.parse(data)
    deposited, withdrawn, spent, claimed = (
        r.total_deposited,
        r.total_withdrawn,
        r.total_spent,
        r.total_claimed,
    )
    return CreditVaultAccount(
        pubkey=pubkey,
        owner=_pk(r.owner),
        agent=_pk(r.agent),
        usdc_mint=_pk(r.usdc_mint),
        vault_token_account=_pk(r.vault_token_account),
        total_deposited=deposited,
        total_withdrawn=withdrawn,
        total_spent=spent,
        total_claimed=claimed,
        balance=deposited - withdrawn - spent + claimed,
        frozen=r.frozen,
        created_slot=r.created_slot,
        last_active_slot=r.last_active_slot,
        pending_count=r.pending_count,
    )


def decode_spend_policy(pubkey: Pubkey, data: bytes) -> SpendPolicyAccount:
    r = _SPEND_POLICY_LAYOUT.parse(data)
    whitelist = [_pk(b) for b in r.whitelist if _pk(b) != _DEFAULT_PUBKEY]
    return SpendPolicyAccount(
        pubkey=pubkey,
        vault=_pk(r.vault),
        whitelist=whitelist,
        per_tx_limit_usdc=r.per_tx_limit_usdc,
        hourly_limit_usdc=r.hourly_limit_usdc,
        lifetime_limit_usdc=r.lifetime_limit_usdc,
        hourly_window_start_slot=r.hourly_window_start_slot,
        hourly_window_spent_usdc=r.hourly_window_spent_usdc,
        allow_post_pay=r.allow_post_pay,
    )


def decode_pending_spend(pubkey: Pubkey, data: bytes) -> PendingSpendAccount:
    r = _PENDING_SPEND_LAYOUT.parse(data)
    return PendingSpendAccount(
        pubkey=pubkey,
        vault=_pk(r.vault),
        agent=_pk(r.agent),
        service=_pk(r.service),
        amount_usdc=r.amount_usdc,
        nonce=r.nonce,
        requested_slot=r.requested_slot,
    )


def decode_service_registry(pubkey: Pubkey, data: bytes) -> ServiceRegistryAccount:
    r = _SERVICE_REGISTRY_LAYOUT.parse(data)
    return ServiceRegistryAccount(
        pubkey=pubkey,
        authority=_pk(r.authority),
        name=_utf8_trim(r.name),
        category=_category_from_index(r.category),
        total_agents_served=r.total_agents_served,
        total_volume_received_usdc=r.total_volume_received_usdc,
        active=r.active,
        first_active_slot=r.first_active_slot,
        last_active_slot=r.last_active_slot,
    )


def decode_agent_profile(pubkey: Pubkey, data: bytes) -> AgentProfileAccount:
    r = _AGENT_PROFILE_LAYOUT.parse(data)
    return AgentProfileAccount(
        pubkey=pubkey,
        authority=_pk(r.authority),
        owner=_pk(r.owner),
        agent_uri=_utf8_trim(r.agent_uri),
        external_agent_id=r.external_agent_id,
        total_transactions=r.total_transactions,
        total_volume_usdc=r.total_volume_usdc,
        consecutive_success=r.consecutive_success,
        total_feedback_count=r.total_feedback_count,
        active_negative_feedback_count=r.active_negative_feedback_count,
        services_used=r.services_used,
        first_active_slot=r.first_active_slot,
        last_active_slot=r.last_active_slot,
        reputation_score=r.reputation_score,
    )
