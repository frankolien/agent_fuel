import type { LiveEventFrame, LiveStatus, Subscription } from "./types.js";

// Isomorphic WebSocket: prefer the runtime global (browsers, Node 22+), fall
// back to the `ws` package for Node 18-21. The fallback is resolved lazily so
// browser bundlers don't pull in `ws`.
type AnyWebSocket = {
  readyState: number;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (ev: { data: unknown }) => void): void;
};
type WebSocketCtor = new (url: string) => AnyWebSocket;

let cachedCtor: WebSocketCtor | Promise<WebSocketCtor> | null = null;

async function getWebSocketCtor(): Promise<WebSocketCtor> {
  if (cachedCtor) return cachedCtor;
  const globalCtor = (globalThis as { WebSocket?: WebSocketCtor }).WebSocket;
  if (globalCtor) {
    cachedCtor = globalCtor;
    return globalCtor;
  }
  cachedCtor = (async () => {
    const mod = await import("ws");
    return mod.WebSocket as unknown as WebSocketCtor;
  })();
  return cachedCtor;
}

const WS_OPEN = 1;
const MAX_BACKOFF_MS = 30_000;

export type SubscribeOptions = {
  onFrame: (frame: LiveEventFrame) => void;
  onStatus?: (status: LiveStatus) => void;
};

export function subscribe(url: string, opts: SubscribeOptions): Subscription {
  let socket: AnyWebSocket | null = null;
  let alive = true;
  let attempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let currentStatus: LiveStatus = "connecting";

  function setStatus(next: LiveStatus): void {
    currentStatus = next;
    opts.onStatus?.(next);
  }

  async function connect(): Promise<void> {
    if (!alive) return;
    setStatus(attempts === 0 ? "connecting" : "reconnecting");
    const WS = await getWebSocketCtor();
    if (!alive) return;
    socket = new WS(url);

    socket.addEventListener("open", () => {
      attempts = 0;
      setStatus("open");
    });

    socket.addEventListener("message", (ev) => {
      if (typeof ev.data !== "string" || ev.data.length === 0) return;
      try {
        const parsed = JSON.parse(ev.data) as LiveEventFrame;
        if (parsed.type === "event") opts.onFrame(parsed);
      } catch {
        // Future backend versions may emit ping/keepalive frames — ignore.
      }
    });

    socket.addEventListener("close", () => {
      if (!alive) return;
      attempts += 1;
      const delay = Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** (attempts - 1));
      setStatus("reconnecting");
      reconnectTimer = setTimeout(() => {
        void connect();
      }, delay);
    });

    // `error` events are followed by `close`; nothing extra to do here.
    socket.addEventListener("error", () => {});
  }

  void connect();

  return {
    close(): void {
      alive = false;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      if (socket && socket.readyState === WS_OPEN) {
        socket.close(1000, "client close");
      }
      socket = null;
      setStatus("closed");
    },
    get status(): LiveStatus {
      return currentStatus;
    },
  };
}

// Translate the SDK's apiBase (an HTTP URL) into the matching WebSocket URL.
export function wsUrl(apiBase: string, path: string): string {
  if (apiBase.startsWith("https://")) return apiBase.replace(/^https/, "wss") + path;
  if (apiBase.startsWith("http://")) return apiBase.replace(/^http/, "ws") + path;
  return apiBase + path;
}

// Public entity-scoped subscriptions. `AgentFuel.onEvent()` covers the agent
// channel; these mirror it for the other two entity types so callers without
// an agent keypair (e.g. a service-side recorder) can also tap the stream.

export function subscribeService(
  apiBase: string,
  servicePubkey: string,
  opts: SubscribeOptions,
): Subscription {
  return subscribe(wsUrl(apiBase, `/ws/services/${servicePubkey}`), opts);
}

export function subscribeVault(
  apiBase: string,
  vaultPubkey: string,
  opts: SubscribeOptions,
): Subscription {
  return subscribe(wsUrl(apiBase, `/ws/vaults/${vaultPubkey}`), opts);
}
