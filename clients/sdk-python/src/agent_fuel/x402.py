"""HTTP 402 wrapper. Same primitive as `paymentRequired()` in
clients/sdk/src/x402.ts: any request that comes back as 402 is
intercepted, the payment requirement parsed, the on-chain `spend()`
fired, and the request retried once with `X-Payment: <signature>` set.

A second 402 propagates to the caller — a misbehaving server can't
drain the vault in a loop. The wrapper is fetch-shaped (`request(method,
url, **kwargs)`) so it slots into existing httpx call-sites without
restructuring them."""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

import httpx

from .errors import AgentFuelError

_REQUIREMENT_HEADER = "X-Payment-Required"
_PAYMENT_HEADER = "X-Payment"


@dataclass(frozen=True)
class PaymentRequirement:
    """Parsed shape of a server's 402 challenge. Accepts both the
    SDK-native (`recipient` / `amount_usdc`) and x402-spec
    (`payTo` / `maxAmountRequired`) field names so servers using either
    vocabulary work without configuration."""

    recipient: str
    amount_usdc: int
    network: str | None = None
    resource: str | None = None


class PaymentParseError(AgentFuelError):
    """Raised when a 402 response has neither a parseable header nor a
    parseable JSON body, or is missing the required fields."""


PaymentRequiredHook = Callable[[PaymentRequirement], None | Awaitable[None]]
PaidHook = Callable[[str, PaymentRequirement], None | Awaitable[None]]


def payment_required(
    fuel: Any,
    *,
    http_client: httpx.AsyncClient,
    on_payment_required: PaymentRequiredHook | None = None,
    on_paid: PaidHook | None = None,
) -> PaymentRequiredFetcher:
    """Build a fetch-shaped callable bound to this `AgentFuel` instance.
    The returned object is both directly callable (`await fetcher("GET",
    url)`) and exposes per-method helpers (`fetcher.get(url, ...)`)."""
    return PaymentRequiredFetcher(
        fuel=fuel,
        http_client=http_client,
        on_payment_required=on_payment_required,
        on_paid=on_paid,
    )


class PaymentRequiredFetcher:
    """Fetch-shaped wrapper that transparently handles HTTP 402.

    1. Forward the request via the bound `httpx.AsyncClient`.
    2. If the status is not 402, return the response unchanged.
    3. Otherwise parse the requirement, call `fuel.spend()`, and retry
       the same request once with `X-Payment: <signature>`.

    The retry is a single attempt — a second 402 surfaces as `Response`
    to the caller (we deliberately don't raise, so existing code that
    branches on `res.status_code` keeps working)."""

    def __init__(
        self,
        *,
        fuel: Any,
        http_client: httpx.AsyncClient,
        on_payment_required: PaymentRequiredHook | None,
        on_paid: PaidHook | None,
    ) -> None:
        self._fuel = fuel
        self._http = http_client
        self._on_payment_required = on_payment_required
        self._on_paid = on_paid

    async def __call__(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        return await self.request(method, url, **kwargs)

    async def request(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        first = await self._http.request(method, url, **kwargs)
        if first.status_code != 402:
            return first

        req = _parse_requirement(first)
        await _maybe_await(self._on_payment_required, req)

        result = await self._fuel.spend(
            recipient=req.recipient, amount_usdc=req.amount_usdc
        )
        signature = str(result.signature)
        await _maybe_await(self._on_paid, signature, req)

        retry_kwargs = dict(kwargs)
        headers = httpx.Headers(retry_kwargs.pop("headers", None) or {})
        headers[_PAYMENT_HEADER] = signature
        return await self._http.request(method, url, headers=headers, **retry_kwargs)

    async def get(self, url: str, **kwargs: Any) -> httpx.Response:
        return await self.request("GET", url, **kwargs)

    async def post(self, url: str, **kwargs: Any) -> httpx.Response:
        return await self.request("POST", url, **kwargs)

    async def put(self, url: str, **kwargs: Any) -> httpx.Response:
        return await self.request("PUT", url, **kwargs)

    async def patch(self, url: str, **kwargs: Any) -> httpx.Response:
        return await self.request("PATCH", url, **kwargs)

    async def delete(self, url: str, **kwargs: Any) -> httpx.Response:
        return await self.request("DELETE", url, **kwargs)


def _parse_requirement(res: httpx.Response) -> PaymentRequirement:
    header = res.headers.get(_REQUIREMENT_HEADER)
    if header:
        return _from_json(header)
    body = res.text
    if not body or not body.strip():
        raise PaymentParseError(
            f"402 response has no {_REQUIREMENT_HEADER} header and an empty body"
        )
    return _from_json(body)


def _from_json(text: str) -> PaymentRequirement:
    try:
        obj = json.loads(text)
    except json.JSONDecodeError as e:
        raise PaymentParseError(f"payment payload is not valid JSON: {_truncate(text)}") from e
    if not isinstance(obj, dict):
        raise PaymentParseError("payment payload is not an object")

    recipient = _str_field(obj, "recipient") or _str_field(obj, "payTo")
    if not recipient:
        raise PaymentParseError("payment payload missing 'recipient' or 'payTo'")

    amount = _int_field(obj, "amount_usdc")
    if amount is None:
        amount = _int_field(obj, "amountUsdc")
    if amount is None:
        amount = _int_field(obj, "maxAmountRequired")
    if amount is None or amount <= 0:
        raise PaymentParseError(
            "payment payload missing positive 'amount_usdc', 'amountUsdc' or 'maxAmountRequired'"
        )

    return PaymentRequirement(
        recipient=recipient,
        amount_usdc=amount,
        network=_str_field(obj, "network"),
        resource=_str_field(obj, "resource"),
    )


def _str_field(obj: dict[str, Any], key: str) -> str | None:
    v = obj.get(key)
    return v if isinstance(v, str) and v else None


def _int_field(obj: dict[str, Any], key: str) -> int | None:
    v = obj.get(key)
    if isinstance(v, bool):
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        return int(v) if v.is_integer() else None
    if isinstance(v, str):
        try:
            return int(v, 10)
        except ValueError:
            return None
    return None


async def _maybe_await(handler: Callable[..., Any] | None, *args: Any) -> None:
    if handler is None:
        return
    result = handler(*args)
    if hasattr(result, "__await__"):
        await result


def _truncate(s: str, limit: int = 80) -> str:
    return s if len(s) <= limit else s[:limit] + "…"
