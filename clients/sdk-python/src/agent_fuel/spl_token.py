from __future__ import annotations

from solders.instruction import AccountMeta, Instruction
from solders.pubkey import Pubkey
from solders.system_program import ID as SYSTEM_PROGRAM_ID

from .constants import ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID


def get_associated_token_address(mint: Pubkey, owner: Pubkey) -> Pubkey:
    """SPL ATA derivation: `findProgramAddress([owner, token_program, mint],
    associated_token_program)`. Stable across the SPL token ecosystem so any
    client that follows the spec produces the same address."""
    ata, _ = Pubkey.find_program_address(
        [bytes(owner), bytes(TOKEN_PROGRAM_ID), bytes(mint)],
        ASSOCIATED_TOKEN_PROGRAM_ID,
    )
    return ata


def create_associated_token_account_idempotent_instruction(
    payer: Pubkey,
    associated_token: Pubkey,
    owner: Pubkey,
    mint: Pubkey,
) -> Instruction:
    """SPL Associated Token Account program instruction 1 — the idempotent
    create variant. Variant 0 fails if the ATA already exists; variant 1
    succeeds silently, which is what we want for paying-bot pre-flight.

    Account layout matches `spl-associated-token-account` crate exactly:
    [payer(s,w), ata(w), owner(r), mint(r), system_program(r), token_program(r)]
    """
    return Instruction(
        program_id=ASSOCIATED_TOKEN_PROGRAM_ID,
        accounts=[
            AccountMeta(pubkey=payer, is_signer=True, is_writable=True),
            AccountMeta(pubkey=associated_token, is_signer=False, is_writable=True),
            AccountMeta(pubkey=owner, is_signer=False, is_writable=False),
            AccountMeta(pubkey=mint, is_signer=False, is_writable=False),
            AccountMeta(pubkey=SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False),
            AccountMeta(pubkey=TOKEN_PROGRAM_ID, is_signer=False, is_writable=False),
        ],
        data=bytes([1]),
    )
