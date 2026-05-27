// Per-agent live event stream. Wraps the backend's /ws/agents/:pk endpoint
// behind a callback API; flips to a synthetic emitter when VITE_USE_MOCKS=1
// so detail pages render the same connection-state badge + ticker offline.

import { config } from "../config";
import { MOCK_AGENTS } from "./mocks";
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
  if (config.useMocks) return mockSubscribe(pubkey, onFrame, onStatus);
  return wsSubscribe(pubkey, onFrame, onStatus);
}

// ---------- Real WS, with reconnect ----------

function wsSubscribe(pubkey: string, onFrame: FrameHandler, onStatus?: StatusHandler): LiveSubscription {
  let socket: WebSocket | null = null;
  let alive = true;
  let attempts = 0;
  let reconnectTimer: number | null = null;

  const url = wsUrl(`/ws/agents/${pubkey}`);

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

// ---------- Mock emitter ----------

const MOCK_SERVICES = [
  "Pyth", "HelixData", "Cortex", "JitoRPC", "OrcaSwap", "Helius", "Jupiter", "ArweaveGate",
];

function mockSubscribe(pubkey: string, onFrame: FrameHandler, onStatus?: StatusHandler): LiveSubscription {
  let alive = true;
  let counter = 0;
  let timer: number | null = null;
  const agent = MOCK_AGENTS.find((a) => a.pubkey === pubkey) ?? MOCK_AGENTS[0]!;

  // Tiny delay so the "connecting" → "open" transition is visible in the UI.
  onStatus?.("connecting");
  window.setTimeout(() => {
    if (!alive) return;
    onStatus?.("open");
    schedule();
  }, 350);

  function schedule() {
    if (!alive) return;
    const next = 1800 + Math.random() * 3200;
    timer = window.setTimeout(emitOne, next);
  }

  function emitOne() {
    if (!alive) return;
    counter += 1;
    const slot = agent.last_active_slot + counter * 8;
    const r = Math.random();
    let frame: LiveEventFrame;
    if (r < 0.72) {
      frame = {
        type: "event",
        signature: randSig(),
        log_index: 0,
        slot,
        program_id: "Vau1111111111111111111111111111111111111111",
        event_name: "Spent",
        payload: {
          agent: pubkey,
          service: MOCK_SERVICES[Math.floor(Math.random() * MOCK_SERVICES.length)],
          amount_usdc: Math.round((1000 + Math.random() * 60_000)),
        },
      };
    } else if (r < 0.88) {
      frame = {
        type: "event",
        signature: randSig(),
        log_index: 0,
        slot,
        program_id: "Vau1111111111111111111111111111111111111111",
        event_name: "Claimed",
        payload: {
          agent: pubkey,
          service: MOCK_SERVICES[Math.floor(Math.random() * MOCK_SERVICES.length)],
          amount_usdc: Math.round((1 + Math.random() * 22) * 1_000_000),
        },
      };
    } else {
      const base = agent.score ?? 700;
      const delta = Math.round((Math.random() - 0.45) * 18);
      frame = {
        type: "event",
        signature: randSig(),
        log_index: 0,
        slot,
        program_id: "Rep1111111111111111111111111111111111111111",
        event_name: "ScoreComputed",
        payload: { agent: pubkey, score: Math.max(0, Math.min(1000, base + delta)) },
      };
    }
    onFrame(frame);
    schedule();
  }

  return {
    unsubscribe() {
      alive = false;
      if (timer !== null) window.clearTimeout(timer);
      onStatus?.("closed");
    },
  };
}

function randSig(): string {
  const c = "abcdefghkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)]!;
  s += "..";
  for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)]!;
  return s;
}
