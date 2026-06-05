"""WebSocket subscriptions for the backend's live-event hub.

Mirrors `clients/sdk/src/live.ts`. The backend emits one JSON frame per
indexed program event on three channels:

  /ws/agents/<pubkey>
  /ws/services/<pubkey>
  /ws/vaults/<pubkey>

The connection self-heals: a dropped socket is retried with exponential
backoff up to 30s, status transitions fire `on_status`, and `close()`
tears the loop down cleanly. The `websockets` library handles ping/pong
keepalives for us so we only need to forward decoded frames."""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Awaitable, Callable, Literal

import websockets
from websockets.exceptions import ConnectionClosed

from .types import LiveEventFrame, LiveStatus

logger = logging.getLogger("agent_fuel.live")

FrameHandler = Callable[[LiveEventFrame], None | Awaitable[None]]
StatusHandler = Callable[[LiveStatus], None | Awaitable[None]]

_MAX_BACKOFF_SECONDS = 30.0


@dataclass
class Subscription:
    """Handle to a running WebSocket subscription. Both callbacks may be
    sync or async — async ones are awaited on the loop the subscription
    was created on."""

    _task: asyncio.Task[None]
    _close_event: asyncio.Event
    _status_ref: "_StatusRef"

    @property
    def status(self) -> LiveStatus:
        return self._status_ref.value

    async def close(self) -> None:
        """Idempotent shutdown — safe to call from any coroutine."""
        if self._close_event.is_set():
            return
        self._close_event.set()
        # Wait for the background loop to observe the close and exit.
        # Suppress CancelledError so callers can `await sub.close()` from a
        # cancelled task without re-raising into their handler.
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.debug("live subscription task raised on close", exc_info=True)


class _StatusRef:
    """Tiny mutable container so the `Subscription.status` property can
    observe transitions made by the background task without exposing the
    field as writable on the dataclass itself."""

    __slots__ = ("value",)

    def __init__(self, initial: LiveStatus) -> None:
        self.value: LiveStatus = initial


async def _invoke(handler: Callable[..., None | Awaitable[None]] | None, arg: object) -> None:
    if handler is None:
        return
    result = handler(arg)  # type: ignore[arg-type]
    if asyncio.iscoroutine(result):
        await result


def subscribe(
    url: str,
    *,
    on_frame: FrameHandler,
    on_status: StatusHandler | None = None,
) -> Subscription:
    """Open a self-healing subscription to `url` and forward parsed
    `LiveEventFrame`s to `on_frame`. Returns immediately; the connection
    is established on the loop's next tick. The returned `Subscription`
    must be `await sub.close()`d to release the socket and cancel the
    reconnect loop."""

    close_event = asyncio.Event()
    status_ref = _StatusRef("connecting")

    async def run() -> None:
        attempts = 0
        while not close_event.is_set():
            new_status: LiveStatus = "connecting" if attempts == 0 else "reconnecting"
            status_ref.value = new_status
            await _invoke(on_status, new_status)
            try:
                async with websockets.connect(url, ping_interval=20, ping_timeout=20) as ws:
                    attempts = 0
                    status_ref.value = "open"
                    await _invoke(on_status, "open")
                    await _pump_messages(ws, on_frame, close_event)
            except (OSError, ConnectionClosed) as e:
                logger.debug("live socket dropped: %s", e)
            except Exception:
                logger.exception("live socket raised; reconnecting")
            if close_event.is_set():
                break
            attempts += 1
            delay = min(_MAX_BACKOFF_SECONDS, 1.0 * (2 ** (attempts - 1)))
            status_ref.value = "reconnecting"
            await _invoke(on_status, "reconnecting")
            try:
                await asyncio.wait_for(close_event.wait(), timeout=delay)
            except asyncio.TimeoutError:
                pass
        status_ref.value = "closed"
        await _invoke(on_status, "closed")

    task = asyncio.create_task(run(), name=f"agent-fuel-live[{url}]")
    return Subscription(_task=task, _close_event=close_event, _status_ref=status_ref)


async def _pump_messages(
    ws: websockets.WebSocketClientProtocol,
    on_frame: FrameHandler,
    close_event: asyncio.Event,
) -> None:
    close_waiter = asyncio.create_task(close_event.wait())
    try:
        while not close_event.is_set():
            recv_task = asyncio.create_task(ws.recv())
            done, _ = await asyncio.wait(
                {recv_task, close_waiter}, return_when=asyncio.FIRST_COMPLETED
            )
            if close_waiter in done:
                recv_task.cancel()
                return
            raw = recv_task.result()
            if not isinstance(raw, str) or not raw:
                continue
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                # Future backend versions may emit ping/keepalive frames the
                # `websockets` library doesn't already intercept. Ignore.
                continue
            if not isinstance(parsed, dict) or parsed.get("type") != "event":
                continue
            frame = _decode_frame(parsed)
            await _invoke(on_frame, frame)
    finally:
        if not close_waiter.done():
            close_waiter.cancel()


def _decode_frame(parsed: dict[str, object]) -> LiveEventFrame:
    """Permissive decode — missing/typo'd fields fall through to defaults
    rather than throwing, so a backend tweak that adds a new optional
    field doesn't break every running subscriber."""
    payload = parsed.get("payload")
    return LiveEventFrame(
        type="event",
        signature=str(parsed.get("signature", "")),
        log_index=int(parsed.get("log_index", 0) or 0),
        slot=int(parsed.get("slot", 0) or 0),
        program_id=str(parsed.get("program_id", "")),
        event_name=str(parsed.get("event_name", "")),
        payload=payload if isinstance(payload, dict) else {},
    )


# --- URL helpers -------------------------------------------------------------

EntityChannel = Literal["agents", "services", "vaults"]


def ws_url(api_base: str, path: str) -> str:
    """Translate the backend's HTTP base into the matching WS scheme."""
    if api_base.startswith("https://"):
        return "wss://" + api_base[len("https://") :].rstrip("/") + path
    if api_base.startswith("http://"):
        return "ws://" + api_base[len("http://") :].rstrip("/") + path
    return api_base.rstrip("/") + path


def channel_url(api_base: str, channel: EntityChannel, pubkey: str) -> str:
    return ws_url(api_base, f"/ws/{channel}/{pubkey}")
