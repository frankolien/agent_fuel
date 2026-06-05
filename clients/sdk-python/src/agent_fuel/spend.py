"""Standalone `spend()` — burn USDC from the vault to an arbitrary
recipient *without* recording a reputation event.

Use this when the recipient isn't registered as a Service on Agent Fuel
(e.g. an x402 server that just wants USDC and doesn't care about the
reputation rail). When the recipient *is* registered, prefer `pay()`
because it bundles `record_payment` + `compute_score` atomically.

Mirrors `AgentFuel.spend()` in clients/sdk/src/client.ts."""

from __future__ import annotations

from dataclasses import dataclass

import httpx
from solders.keypair import Keypair
from solders.signature import Signature

from .anchor_errors import map_spend_error
from .errors import ZeroAmountError
from .guardrails import guard_spend
from .instructions import spend_ix
from .pay import _fetch_account_data, _get_slot
from .pda import Pubkeyish, policy_pda, to_pubkey, vault_pda
from .rpc import send_and_confirm
from .spl_token import (
    create_associated_token_account_idempotent_instruction,
    get_associated_token_address,
)
from .types import decode_credit_vault, decode_spend_policy


@dataclass(frozen=True)
class SpendResult:
    signature: Signature


async def spend(
    *,
    agent: Keypair,
    owner: Pubkeyish,
    recipient: Pubkeyish,
    amount_usdc: int,
    http_client: httpx.AsyncClient,
    rpc_url: str,
) -> SpendResult:
    if amount_usdc <= 0:
        raise ZeroAmountError()

    owner_pk = to_pubkey(owner)
    recipient_pk = to_pubkey(recipient)
    vault_addr = vault_pda(owner_pk, agent.pubkey())
    policy_addr = policy_pda(vault_addr)

    raw_vault = await _fetch_account_data(http_client, rpc_url, vault_addr)
    raw_policy = await _fetch_account_data(http_client, rpc_url, policy_addr)
    current_slot = await _get_slot(http_client, rpc_url)

    vault = decode_credit_vault(vault_addr, raw_vault)
    policy = decode_spend_policy(policy_addr, raw_policy)
    guard_spend(
        vault=vault,
        policy=policy,
        service=recipient_pk,
        amount_usdc=amount_usdc,
        current_slot=current_slot,
    )

    recipient_token_account = get_associated_token_address(vault.usdc_mint, recipient_pk)
    create_ata = create_associated_token_account_idempotent_instruction(
        payer=agent.pubkey(),
        associated_token=recipient_token_account,
        owner=recipient_pk,
        mint=vault.usdc_mint,
    )
    burn = spend_ix(
        agent=agent.pubkey(),
        vault=vault_addr,
        policy=policy_addr,
        vault_token_account=vault.vault_token_account,
        service_token_account=recipient_token_account,
        amount_usdc=amount_usdc,
    )
    try:
        sig = await send_and_confirm(http_client, rpc_url, [create_ata, burn], [agent])
    except Exception as e:
        raise map_spend_error(
            e,
            service=recipient_pk,
            amount_usdc=amount_usdc,
            vault=vault,
            policy=policy,
        ) from e
    return SpendResult(signature=sig)
