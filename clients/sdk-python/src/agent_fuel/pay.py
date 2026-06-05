"""Atomic spend + record_payment + compute_score in a single transaction.

Mirrors `pay()` in clients/sdk/src/pay.ts and `Spender::pay()` in
clients/runtime/src/lib.rs. The agent signs the spend half; the service
keypair co-signs the reputation half; compute_score is bundled so the
on-chain score moves in the same tx (see project_score_pipeline.md)."""

from __future__ import annotations

from dataclasses import dataclass

import httpx
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.signature import Signature

from .anchor_errors import map_pay_error
from .errors import AccountNotFoundError, ZeroAmountError
from .guardrails import guard_spend
from .instructions import (
    compute_score_ix,
    record_payment_ix,
    spend_ix,
)
from .pda import (
    Pubkeyish,
    agent_profile_pda,
    agent_service_link_pda,
    policy_pda,
    receipt_used_pda,
    service_registry_pda,
    to_pubkey,
    vault_pda,
)
from .rpc import _rpc_call, send_and_confirm  # noqa: F401 (re-used by client)
from .spl_token import (
    create_associated_token_account_idempotent_instruction,
    get_associated_token_address,
)
from .types import decode_credit_vault, decode_spend_policy


@dataclass(frozen=True)
class PayResult:
    signature: Signature


async def pay(
    *,
    agent: Keypair,
    service: Keypair,
    owner: Pubkeyish,
    amount_usdc: int,
    receipt_hash: bytes,
    http_client: httpx.AsyncClient,
    rpc_url: str,
) -> PayResult:
    if amount_usdc <= 0:
        raise ZeroAmountError()
    if len(receipt_hash) != 32:
        raise ValueError(f"receipt_hash must be 32 bytes (got {len(receipt_hash)})")

    owner_pk = to_pubkey(owner)
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
        service=service.pubkey(),
        amount_usdc=amount_usdc,
        current_slot=current_slot,
    )

    service_token_account = get_associated_token_address(vault.usdc_mint, service.pubkey())
    create_ata = create_associated_token_account_idempotent_instruction(
        payer=agent.pubkey(),
        associated_token=service_token_account,
        owner=service.pubkey(),
        mint=vault.usdc_mint,
    )

    profile = agent_profile_pda(agent.pubkey())
    registry = service_registry_pda(service.pubkey())
    link = agent_service_link_pda(profile, registry)
    receipt = receipt_used_pda(receipt_hash)

    ixs = [
        create_ata,
        spend_ix(
            agent=agent.pubkey(),
            vault=vault_addr,
            policy=policy_addr,
            vault_token_account=vault.vault_token_account,
            service_token_account=service_token_account,
            amount_usdc=amount_usdc,
        ),
        record_payment_ix(
            service=service.pubkey(),
            agent_profile=profile,
            service_registry=registry,
            agent_service_link=link,
            receipt_used=receipt,
            amount_usdc=amount_usdc,
            receipt_hash=receipt_hash,
        ),
        compute_score_ix(caller=agent.pubkey(), agent_profile=profile),
    ]
    try:
        sig = await send_and_confirm(http_client, rpc_url, ixs, [agent, service])
    except Exception as e:
        raise map_pay_error(
            e,
            service=service.pubkey(),
            amount_usdc=amount_usdc,
            receipt_hash=receipt_hash,
            vault=vault,
            policy=policy,
        ) from e
    return PayResult(signature=sig)


# --- Internals (also reused by request_spend / register_service) ----------

async def _fetch_account_data(
    client: httpx.AsyncClient, rpc_url: str, address: Pubkey
) -> bytes:
    """Bare `getAccountInfo` returning raw account data. Doesn't enforce
    program ownership — `pay()` already knows which program owns each PDA
    and the on-chain instructions will reject a confused-deputy."""
    import base64

    result = await _rpc_call(
        client,
        rpc_url,
        "getAccountInfo",
        [str(address), {"encoding": "base64", "commitment": "confirmed"}],
    )
    if result is None or result.get("value") is None:
        raise AccountNotFoundError(str(address))
    data_field = result["value"]["data"]
    if isinstance(data_field, list):
        b64 = data_field[0]
    else:
        b64 = data_field
    return base64.b64decode(b64)


async def _get_slot(client: httpx.AsyncClient, rpc_url: str) -> int:
    result = await _rpc_call(client, rpc_url, "getSlot", [{"commitment": "confirmed"}])
    return int(result)
