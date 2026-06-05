from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import httpx
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.rpc.responses import GetAccountInfoResp

from .constants import CREDIT_VAULT_PROGRAM_ID, REPUTATION_PROGRAM_ID
from .errors import AccountNotFoundError, HttpError, OwnerNotConfiguredError
from .pay import PayResult, pay as _pay_standalone
from .pda import (
    Pubkeyish,
    policy_pda,
    service_registry_pda,
    to_pubkey,
    vault_pda,
)
from .register_service import (
    RegisterServiceResult,
    register_service as _register_service_standalone,
)
from .request_spend import (
    RequestSpendResult,
    request_spend as _request_spend_standalone,
)
from .types import (
    CreditVaultAccount,
    ReputationLookup,
    ServiceCategory,
    ServiceRegistryAccount,
    SpendPolicyAccount,
    decode_credit_vault,
    decode_service_registry,
    decode_spend_policy,
)

Cluster = Literal["mainnet-beta", "devnet", "testnet", "localnet"]

DEFAULT_API_BASE = "https://api.agentfuel.online"

_RPC_DEFAULTS: dict[Cluster, str] = {
    "mainnet-beta": "https://api.mainnet-beta.solana.com",
    "devnet": "https://api.devnet.solana.com",
    "testnet": "https://api.testnet.solana.com",
    "localnet": "http://127.0.0.1:8899",
}


@dataclass(frozen=True)
class VaultRef:
    """Optional override for read methods. When the owner was passed to the
    constructor, no args reads the agent's own vault; pass a ref to inspect
    someone else's."""

    owner: Pubkeyish | None = None
    agent: Pubkeyish | None = None


class AgentFuel:
    """High-level Agent Fuel client. Read methods are async — every network
    round-trip goes through a single shared `httpx.AsyncClient`. Use as a
    context manager (``async with AgentFuel(...) as fuel:``) or call
    `close()` explicitly to release the connection pool."""

    def __init__(
        self,
        *,
        agent: Keypair,
        cluster: Cluster = "devnet",
        rpc: str | None = None,
        owner: Pubkeyish | None = None,
        api_base: str = DEFAULT_API_BASE,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self.agent = agent
        self.cluster: Cluster = cluster
        self.rpc_url = rpc or _RPC_DEFAULTS[cluster]
        self.api_base = api_base.rstrip("/")
        self.owner: Pubkey | None = to_pubkey(owner) if owner is not None else None
        # `_owns_http` distinguishes "user supplied" from "we created" so we
        # only close the client we constructed ourselves. The 30s timeout
        # accommodates Solana's public devnet RPC which routinely takes
        # 5-15s during TLS handshake under load — tighter ceilings produce
        # spurious ConnectTimeout failures. Callers who want a stricter
        # bound can pass their own `http_client=`.
        self._http = http_client or httpx.AsyncClient(timeout=30.0)
        self._owns_http = http_client is None

    @property
    def agent_pubkey(self) -> Pubkey:
        return self.agent.pubkey()

    async def __aenter__(self) -> "AgentFuel":
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.close()

    async def close(self) -> None:
        if self._owns_http:
            await self._http.aclose()

    # ---- read methods -----------------------------------------------------

    async def get_score(self, agent: Pubkeyish | None = None) -> ReputationLookup:
        """Public reputation snapshot via REST. Backend returns 404 when no
        AgentProfile mirror exists yet — surfaced as `AccountNotFoundError`."""
        target = to_pubkey(agent) if agent is not None else self.agent_pubkey
        url = f"{self.api_base}/reputation/{target}"
        res = await self._http.get(url)
        if res.status_code == 404:
            raise AccountNotFoundError(str(target))
        if res.status_code >= 400:
            raise HttpError(res.status_code, url, _safe_text(res))
        body = res.json()
        return ReputationLookup(**body)

    async def get_vault_balance(self, ref: VaultRef | None = None) -> CreditVaultAccount:
        owner = self._resolve_owner(ref.owner if ref else None)
        agent = to_pubkey(ref.agent) if ref and ref.agent else self.agent_pubkey
        pda = vault_pda(owner, agent)
        data = await self._fetch_account(pda, CREDIT_VAULT_PROGRAM_ID)
        return decode_credit_vault(pda, data)

    async def get_policy(self, ref: VaultRef | None = None) -> SpendPolicyAccount:
        owner = self._resolve_owner(ref.owner if ref else None)
        agent = to_pubkey(ref.agent) if ref and ref.agent else self.agent_pubkey
        vault = vault_pda(owner, agent)
        pda = policy_pda(vault)
        data = await self._fetch_account(pda, CREDIT_VAULT_PROGRAM_ID)
        return decode_spend_policy(pda, data)

    async def check_service(self, service_authority: Pubkeyish) -> ServiceRegistryAccount:
        pda = service_registry_pda(service_authority)
        data = await self._fetch_account(pda, REPUTATION_PROGRAM_ID)
        return decode_service_registry(pda, data)

    # ---- action methods ---------------------------------------------------

    async def pay(
        self,
        *,
        service: Keypair,
        amount_usdc: int,
        receipt_hash: bytes,
        owner: Pubkeyish | None = None,
    ) -> PayResult:
        """Atomic spend + record_payment + compute_score. See `pay()`
        standalone for full semantics."""
        return await _pay_standalone(
            agent=self.agent,
            service=service,
            owner=self._resolve_owner(owner),
            amount_usdc=amount_usdc,
            receipt_hash=receipt_hash,
            http_client=self._http,
            rpc_url=self.rpc_url,
        )

    async def request_spend(
        self,
        *,
        service: Pubkeyish,
        amount_usdc: int,
        owner: Pubkeyish | None = None,
    ) -> RequestSpendResult:
        return await _request_spend_standalone(
            agent=self.agent,
            owner=self._resolve_owner(owner),
            service=service,
            amount_usdc=amount_usdc,
            http_client=self._http,
            rpc_url=self.rpc_url,
        )

    async def register_service(
        self,
        *,
        sponsor: Keypair,
        service: Keypair,
        name: str,
        category: ServiceCategory,
        service_uri: str | None = None,
    ) -> RegisterServiceResult:
        return await _register_service_standalone(
            sponsor=sponsor,
            service=service,
            name=name,
            category=category,
            service_uri=service_uri,
            http_client=self._http,
            rpc_url=self.rpc_url,
        )

    # ---- internals --------------------------------------------------------

    def _resolve_owner(self, override: Pubkeyish | None) -> Pubkey:
        if override is not None:
            return to_pubkey(override)
        if self.owner is None:
            raise OwnerNotConfiguredError()
        return self.owner

    async def _fetch_account(self, address: Pubkey, expected_owner: Pubkey) -> bytes:
        """Single-RPC account fetch with base64 encoding. Raises
        `AccountNotFoundError` when the account is missing or owned by a
        different program (defence against confused-deputy reads)."""
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getAccountInfo",
            "params": [str(address), {"encoding": "base64", "commitment": "confirmed"}],
        }
        res = await self._http.post(self.rpc_url, json=payload)
        if res.status_code >= 400:
            raise HttpError(res.status_code, self.rpc_url, _safe_text(res))
        parsed = GetAccountInfoResp.from_json(res.text)
        if parsed.value is None:
            raise AccountNotFoundError(str(address))
        if parsed.value.owner != expected_owner:
            raise AccountNotFoundError(
                f"{address} (owner mismatch: account owned by {parsed.value.owner})"
            )
        return bytes(parsed.value.data)


def _safe_text(res: httpx.Response) -> str | None:
    try:
        return res.text
    except Exception:
        return None
