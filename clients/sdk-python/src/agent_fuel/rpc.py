"""Thin async JSON-RPC wrapper over httpx — just the surface we need to
build, send, and confirm a transaction without pulling in `solana-py`
(which is heavier and has older maintenance signals than `solders`).

Every helper expects an `httpx.AsyncClient` so the SDK reuses the one
the `AgentFuel` client already holds — no extra connection pools."""

from __future__ import annotations

import asyncio
import base64
from typing import Any

import httpx
from solders.hash import Hash
from solders.instruction import Instruction
from solders.keypair import Keypair
from solders.message import MessageV0
from solders.pubkey import Pubkey
from solders.signature import Signature
from solders.transaction import VersionedTransaction

from .errors import AgentFuelError, HttpError


async def _rpc_call(client: httpx.AsyncClient, url: str, method: str, params: list[Any]) -> Any:
    res = await client.post(
        url,
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
    )
    if res.status_code >= 400:
        raise HttpError(res.status_code, url, _safe_text(res))
    body = res.json()
    if "error" in body:
        err = body["error"]
        raise AgentFuelError(f"RPC {method} failed: {err.get('message', err)}")
    return body.get("result")


async def get_latest_blockhash(client: httpx.AsyncClient, rpc_url: str) -> Hash:
    result = await _rpc_call(
        client, rpc_url, "getLatestBlockhash", [{"commitment": "confirmed"}]
    )
    return Hash.from_string(result["value"]["blockhash"])


async def send_transaction(
    client: httpx.AsyncClient, rpc_url: str, tx: VersionedTransaction
) -> Signature:
    encoded = base64.b64encode(bytes(tx)).decode()
    sig_str = await _rpc_call(
        client,
        rpc_url,
        "sendTransaction",
        [encoded, {"encoding": "base64", "preflightCommitment": "confirmed"}],
    )
    return Signature.from_string(sig_str)


async def confirm_signature(
    client: httpx.AsyncClient,
    rpc_url: str,
    signature: Signature,
    *,
    timeout_seconds: float = 30.0,
    poll_interval: float = 0.6,
) -> None:
    """Poll `getSignatureStatuses` until confirmed (or finalized). Solana
    typically lands a tx in 1-3s on devnet; the default 30s timeout is
    generous. Raises `AgentFuelError` if the transaction reports an
    on-chain error during confirmation."""
    deadline = asyncio.get_event_loop().time() + timeout_seconds
    last_status: dict[str, Any] | None = None
    while asyncio.get_event_loop().time() < deadline:
        result = await _rpc_call(
            client,
            rpc_url,
            "getSignatureStatuses",
            [[str(signature)], {"searchTransactionHistory": False}],
        )
        statuses = result.get("value", [None])
        status = statuses[0] if statuses else None
        if status is not None:
            last_status = status
            if status.get("err") is not None:
                raise AgentFuelError(f"transaction {signature} failed: {status['err']}")
            confirmation = status.get("confirmationStatus")
            if confirmation in ("confirmed", "finalized"):
                return
        await asyncio.sleep(poll_interval)
    raise AgentFuelError(
        f"transaction {signature} not confirmed within {timeout_seconds}s "
        f"(last status: {last_status})"
    )


async def send_and_confirm(
    client: httpx.AsyncClient,
    rpc_url: str,
    instructions: list[Instruction],
    signers: list[Keypair],
    *,
    payer: Pubkey | None = None,
) -> Signature:
    """Compose, sign, send, and confirm. Payer defaults to the first
    signer's pubkey — matches the convention every other client uses."""
    if not signers:
        raise AgentFuelError("send_and_confirm called with no signers")
    fee_payer = payer if payer is not None else signers[0].pubkey()
    blockhash = await get_latest_blockhash(client, rpc_url)
    message = MessageV0.try_compile(
        payer=fee_payer, instructions=instructions, address_lookup_table_accounts=[],
        recent_blockhash=blockhash,
    )
    tx = VersionedTransaction(message, signers)
    sig = await send_transaction(client, rpc_url, tx)
    await confirm_signature(client, rpc_url, sig)
    return sig


def _safe_text(res: httpx.Response) -> str | None:
    try:
        return res.text
    except Exception:
        return None
