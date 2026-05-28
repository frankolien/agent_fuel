// Entity-scoped live event streams. Wraps the backend's /ws/agents/:pk and
// /ws/vaults/:pk endpoints behind a callback API with exponential-backoff
// reconnect. The transport is identical between the two — only the URL path
// (and therefore which broadcast key the backend subscribes to) differs.

import { config } from "../config";
import type { LiveEventFrame } from "@/types/api";

export type LiveStatus = "connecting" | "open" | "reconnecting" | "closed";

export type LiveSubscription = { unsubscribe(): void };

type FrameHandler = (frame: LiveEventFrame) => void;
type StatusHandler = (status: LiveStatus) => void;

export function subscribeAgent(
  pubkey: string,
  onFrame: FrameHandler,
  onStatus?: StatusHandler,
): LiveSubscription {
  return subscribeChannel(`/ws/agents/${pubkey}`, onFrame, onStatus);
}

/** Vault analogue of `subscribeAgent`. Receives every event whose payload
 *  carries this vault pubkey — Deposited, Spent, Claimed, VaultFrozen, etc.
 *  None of these flowed through the `/ws/agents/:pk` channel because vault
 *  events don't always carry an `agent` field. */
export function subscribeVault(
  pubkey: string,
  onFrame: FrameHandler,
  onStatus?: StatusHandler,
): LiveSubscription {
  return subscribeChannel(`/ws/vaults/${pubkey}`, onFrame, onStatus);
}

function subscribeChannel(
  path: string,
  onFrame: FrameHandler,
  onStatus?: StatusHandler,
): LiveSubscription {
  let socket: WebSocket | null = null;
  let alive = true;
  let attempts = 0;
  let reconnectTimer: number | null = null;

  const url = wsUrl(path);

  function emit(status: LiveStatus) {
    onStatus?.(status);
  }

  function connect() {
    if (!alive) return;
    emit(attempts === 0 ? "connecting" : "reconnecting");

    socket = new WebSocket(url);

    socket.addEventListener("open", () => {
      attempts = 0;
      emit("open");
    });

    socket.addEventListener("message", (ev) => {
      const data = typeof ev.data === "string" ? ev.data : "";
      if (!data) return;
      try {
        const parsed = JSON.parse(data) as LiveEventFrame;
        if (parsed.type === "event") onFrame(parsed);
      } catch {
        // backend may push ping/keepalive frames in a future version — ignore
      }
    });

    socket.addEventListener("close", () => {
      if (!alive) return;
      attempts += 1;
      const delay = Math.min(30_000, 1000 * 2 ** (attempts - 1));
      emit("reconnecting");
      reconnectTimer = window.setTimeout(connect, delay);
    });

    socket.addEventListener("error", () => {
      // close handler will run too; nothing extra needed here
    });
  }

  connect();

  return {
    unsubscribe() {
      alive = false;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (socket && socket.readyState === WebSocket.OPEN) socket.close(1000, "client unsubscribe");
      socket = null;
      emit("closed");
    },
  };
}

function wsUrl(path: string): string {
  const base = config.apiBase;
  if (base.startsWith("https://")) return base.replace(/^https/, "wss") + path;
  if (base.startsWith("http://")) return base.replace(/^http/, "ws") + path;
  return base + path;
}
