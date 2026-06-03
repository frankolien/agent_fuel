from __future__ import annotations

from typing import Union

from solders.pubkey import Pubkey

from .constants import CREDIT_VAULT_PROGRAM_ID, REPUTATION_PROGRAM_ID

Pubkeyish = Union[Pubkey, str]


def to_pubkey(value: Pubkeyish) -> Pubkey:
    return value if isinstance(value, Pubkey) else Pubkey.from_string(value)


def vault_pda(owner: Pubkeyish, agent: Pubkeyish) -> Pubkey:
    pda, _ = Pubkey.find_program_address(
        [b"vault", bytes(to_pubkey(owner)), bytes(to_pubkey(agent))],
        CREDIT_VAULT_PROGRAM_ID,
    )
    return pda


def policy_pda(vault: Pubkeyish) -> Pubkey:
    pda, _ = Pubkey.find_program_address(
        [b"policy", bytes(to_pubkey(vault))],
        CREDIT_VAULT_PROGRAM_ID,
    )
    return pda


def service_registry_pda(service_authority: Pubkeyish) -> Pubkey:
    pda, _ = Pubkey.find_program_address(
        [b"service", bytes(to_pubkey(service_authority))],
        REPUTATION_PROGRAM_ID,
    )
    return pda


def agent_profile_pda(agent: Pubkeyish) -> Pubkey:
    pda, _ = Pubkey.find_program_address(
        [b"agent", bytes(to_pubkey(agent))],
        REPUTATION_PROGRAM_ID,
    )
    return pda


def agent_service_link_pda(agent_profile: Pubkeyish, service_registry: Pubkeyish) -> Pubkey:
    # Seeds are the PDAs themselves (not the raw authority pubkeys) — matches
    # the on-chain Anchor account constraint.
    pda, _ = Pubkey.find_program_address(
        [b"link", bytes(to_pubkey(agent_profile)), bytes(to_pubkey(service_registry))],
        REPUTATION_PROGRAM_ID,
    )
    return pda


def pending_spend_pda(vault: Pubkeyish, nonce: int) -> Pubkey:
    # u64 little-endian — matches Rust `nonce.to_le_bytes()`.
    nonce_bytes = nonce.to_bytes(8, "little", signed=False)
    pda, _ = Pubkey.find_program_address(
        [b"pending", bytes(to_pubkey(vault)), nonce_bytes],
        CREDIT_VAULT_PROGRAM_ID,
    )
    return pda


def receipt_used_pda(receipt_hash: bytes) -> Pubkey:
    if len(receipt_hash) != 32:
        raise ValueError(f"receipt_used_pda expects a 32-byte hash, got {len(receipt_hash)}")
    pda, _ = Pubkey.find_program_address(
        [b"receipt", receipt_hash],
        REPUTATION_PROGRAM_ID,
    )
    return pda
