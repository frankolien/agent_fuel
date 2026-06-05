"""Raw Anchor-instruction builders. Hand-rolled rather than IDL-generated so
the wire format is auditable line-by-line and matches the on-chain layout in
programs/credit_vault and programs/reputation exactly.

Each builder mirrors the corresponding helper in clients/runtime/src/lib.rs.
"""

from __future__ import annotations

from hashlib import sha256

from solders.instruction import AccountMeta, Instruction
from solders.pubkey import Pubkey
from solders.system_program import ID as SYSTEM_PROGRAM_ID

from .constants import CREDIT_VAULT_PROGRAM_ID, REPUTATION_PROGRAM_ID, TOKEN_PROGRAM_ID
from .types import ServiceCategory

_NAME_BYTES = 32
_URI_BYTES = 128


def anchor_discriminator(name: str) -> bytes:
    """Anchor instruction discriminator: `sha256("global:<name>")[:8]`."""
    return sha256(f"global:{name}".encode()).digest()[:8]


def _u64_le(value: int) -> bytes:
    return value.to_bytes(8, "little", signed=False)


def _pack_fixed(value: str, length: int) -> bytes:
    encoded = value.encode("utf-8")
    if len(encoded) > length:
        raise ValueError(f"value exceeds {length} bytes (got {len(encoded)})")
    return encoded.ljust(length, b"\x00")


def _category_index(category: ServiceCategory) -> int:
    # Borsh enum variant order matches programs/reputation/src/state.rs.
    match category:
        case "DataFeed":
            return 0
        case "Compute":
            return 1
        case "Swap":
            return 2
        case "Rpc":
            return 3
        case "Other":
            return 4


def spend_ix(
    *,
    agent: Pubkey,
    vault: Pubkey,
    policy: Pubkey,
    vault_token_account: Pubkey,
    service_token_account: Pubkey,
    amount_usdc: int,
) -> Instruction:
    data = anchor_discriminator("spend") + _u64_le(amount_usdc)
    return Instruction(
        program_id=CREDIT_VAULT_PROGRAM_ID,
        accounts=[
            AccountMeta(pubkey=agent, is_signer=True, is_writable=False),
            AccountMeta(pubkey=vault, is_signer=False, is_writable=True),
            AccountMeta(pubkey=policy, is_signer=False, is_writable=True),
            AccountMeta(pubkey=vault_token_account, is_signer=False, is_writable=True),
            AccountMeta(pubkey=service_token_account, is_signer=False, is_writable=True),
            AccountMeta(pubkey=TOKEN_PROGRAM_ID, is_signer=False, is_writable=False),
        ],
        data=data,
    )


def record_payment_ix(
    *,
    service: Pubkey,
    agent_profile: Pubkey,
    service_registry: Pubkey,
    agent_service_link: Pubkey,
    receipt_used: Pubkey,
    amount_usdc: int,
    receipt_hash: bytes,
) -> Instruction:
    if len(receipt_hash) != 32:
        raise ValueError(f"receipt_hash must be 32 bytes (got {len(receipt_hash)})")
    data = anchor_discriminator("record_payment") + _u64_le(amount_usdc) + receipt_hash
    return Instruction(
        program_id=REPUTATION_PROGRAM_ID,
        accounts=[
            AccountMeta(pubkey=service, is_signer=True, is_writable=True),
            AccountMeta(pubkey=agent_profile, is_signer=False, is_writable=True),
            AccountMeta(pubkey=service_registry, is_signer=False, is_writable=True),
            AccountMeta(pubkey=agent_service_link, is_signer=False, is_writable=True),
            AccountMeta(pubkey=receipt_used, is_signer=False, is_writable=True),
            AccountMeta(pubkey=SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False),
        ],
        data=data,
    )


def compute_score_ix(*, caller: Pubkey, agent_profile: Pubkey) -> Instruction:
    """Permissionless reputation recompute. Bundled into `pay()` so the
    on-chain score advances with every payment — without it the backend's
    `agents.score` mirror stays stuck at 0 since nothing else triggers it.
    See `project_score_pipeline.md` for the full incident."""
    return Instruction(
        program_id=REPUTATION_PROGRAM_ID,
        accounts=[
            AccountMeta(pubkey=caller, is_signer=True, is_writable=False),
            AccountMeta(pubkey=agent_profile, is_signer=False, is_writable=True),
        ],
        data=anchor_discriminator("compute_score"),
    )


def request_spend_ix(
    *,
    agent: Pubkey,
    vault: Pubkey,
    service_token_account: Pubkey,
    pending_spend: Pubkey,
    amount_usdc: int,
) -> Instruction:
    data = anchor_discriminator("request_spend") + _u64_le(amount_usdc)
    return Instruction(
        program_id=CREDIT_VAULT_PROGRAM_ID,
        accounts=[
            AccountMeta(pubkey=agent, is_signer=True, is_writable=True),
            AccountMeta(pubkey=vault, is_signer=False, is_writable=True),
            AccountMeta(pubkey=service_token_account, is_signer=False, is_writable=False),
            AccountMeta(pubkey=pending_spend, is_signer=False, is_writable=True),
            AccountMeta(pubkey=SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False),
        ],
        data=data,
    )


def register_service_ix(
    *,
    sponsor: Pubkey,
    service: Pubkey,
    service_registry: Pubkey,
    name: str,
    category: ServiceCategory,
    service_uri: str = "",
) -> Instruction:
    if not name:
        raise ValueError("name must not be empty")
    data = (
        anchor_discriminator("register_service")
        + _pack_fixed(name, _NAME_BYTES)
        + bytes([_category_index(category)])
        + _pack_fixed(service_uri, _URI_BYTES)
    )
    return Instruction(
        program_id=REPUTATION_PROGRAM_ID,
        accounts=[
            AccountMeta(pubkey=sponsor, is_signer=True, is_writable=True),
            AccountMeta(pubkey=service, is_signer=True, is_writable=False),
            AccountMeta(pubkey=service_registry, is_signer=False, is_writable=True),
            AccountMeta(pubkey=SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False),
        ],
        data=data,
    )
