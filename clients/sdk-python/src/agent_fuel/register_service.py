"""Two-signer service registration. Sponsor pays rent + submits;
service is the long-lived signing identity that co-signs every future
`record_payment`."""

from __future__ import annotations

from dataclasses import dataclass

import httpx
from solders.keypair import Keypair
from solders.signature import Signature

from .instructions import register_service_ix
from .pda import service_registry_pda
from .rpc import send_and_confirm
from .types import ServiceCategory


@dataclass(frozen=True)
class RegisterServiceResult:
    signature: Signature


async def register_service(
    *,
    sponsor: Keypair,
    service: Keypair,
    name: str,
    category: ServiceCategory,
    service_uri: str | None = None,
    http_client: httpx.AsyncClient,
    rpc_url: str,
) -> RegisterServiceResult:
    registry = service_registry_pda(service.pubkey())
    ix = register_service_ix(
        sponsor=sponsor.pubkey(),
        service=service.pubkey(),
        service_registry=registry,
        name=name,
        category=category,
        service_uri=service_uri or "",
    )
    sig = await send_and_confirm(http_client, rpc_url, [ix], [sponsor, service])
    return RegisterServiceResult(signature=sig)
