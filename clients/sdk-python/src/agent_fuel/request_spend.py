"""Over-limit approval flow: agent submits a pending request, owner reviews
from the mobile app, owner calls `approve_spend` (or `cancel_spend`).

Mirrors `request_spend()` in clients/sdk/src/request-spend.ts. Returns the
PendingSpend PDA + nonce so callers can poll for resolution."""

from __future__ import annotations

from dataclasses import dataclass

import httpx
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.signature import Signature

from .errors import ZeroAmountError
from .instructions import request_spend_ix
from .pay import _fetch_account_data
from .pda import Pubkeyish, pending_spend_pda, to_pubkey, vault_pda
from .rpc import send_and_confirm
from .spl_token import get_associated_token_address
from .types import decode_credit_vault


@dataclass(frozen=True)
class RequestSpendResult:
    signature: Signature
    pending_spend: Pubkey
    nonce: int


async def request_spend(
    *,
    agent: Keypair,
    owner: Pubkeyish,
    service: Pubkeyish,
    amount_usdc: int,
    http_client: httpx.AsyncClient,
    rpc_url: str,
) -> RequestSpendResult:
    if amount_usdc <= 0:
        raise ZeroAmountError()

    owner_pk = to_pubkey(owner)
    service_pk = to_pubkey(service)
    vault_addr = vault_pda(owner_pk, agent.pubkey())

    # Read pending_count off the vault to derive the PendingSpend PDA — the
    # on-chain `init` constraint will fail with AccountAlreadyInUse if two
    # concurrent requests race on the same nonce, so callers retrying on
    # that error is the documented pattern.
    vault_data = await _fetch_account_data(http_client, rpc_url, vault_addr)
    vault = decode_credit_vault(vault_addr, vault_data)
    nonce = vault.pending_count
    pending = pending_spend_pda(vault_addr, nonce)

    # Need the ATA address (not necessarily existing yet) because the
    # instruction stores it for later approve_spend.
    service_token_account = get_associated_token_address(vault.usdc_mint, service_pk)

    ix = request_spend_ix(
        agent=agent.pubkey(),
        vault=vault_addr,
        service_token_account=service_token_account,
        pending_spend=pending,
        amount_usdc=amount_usdc,
    )
    sig = await send_and_confirm(http_client, rpc_url, [ix], [agent])
    return RequestSpendResult(signature=sig, pending_spend=pending, nonce=nonce)
