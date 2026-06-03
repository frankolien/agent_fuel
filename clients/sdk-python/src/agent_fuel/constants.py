from __future__ import annotations

import json
from importlib import resources
from typing import Final

from solders.pubkey import Pubkey

# Slots-per-hour matches the credit_vault program's `SLOTS_PER_HOUR` constant
# (8 ticks/sec * 60 sec * 60 min) — used by the hourly-window guardrail.
SLOTS_PER_HOUR: Final[int] = 8 * 60 * 60


def _idl_address(name: str) -> Pubkey:
    data = json.loads(resources.files("agent_fuel.idl").joinpath(name).read_text())
    return Pubkey.from_string(data["address"])


# Program IDs are pulled from the vendored IDLs so a fresh deploy only requires
# re-vendoring the JSON — no hand-edits in two places.
CREDIT_VAULT_PROGRAM_ID: Final[Pubkey] = _idl_address("credit_vault.json")
REPUTATION_PROGRAM_ID: Final[Pubkey] = _idl_address("reputation.json")

# SPL token program. solders ships this as a public constant on a few types but
# not as a top-level import; pin it here so the rest of the SDK has one source.
TOKEN_PROGRAM_ID: Final[Pubkey] = Pubkey.from_string(
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
)
ASSOCIATED_TOKEN_PROGRAM_ID: Final[Pubkey] = Pubkey.from_string(
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
)
