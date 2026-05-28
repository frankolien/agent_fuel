import { useEffect, useState } from "react";
import { useAgentsQuery } from "@/lib/api/hooks";
import { subscribeAgent } from "@/lib/api/live";
import type { LiveEventFrame } from "@/types/api";

const MAX_TICKER = 30;

// Opens one WS per owned agent and collapses every frame into a single rolling
// buffer for the topbar marquee. Re-subscribes whenever the agent set changes.
export function useFleetTicker(): ReadonlyArray<LiveEventFrame> {
  const { data: agents } = useAgentsQuery();
  const [items, setItems] = useState<LiveEventFrame[]>([]);

  useEffect(() => {
    // Guard against a non-array slipping through the query layer (cached
    // payload from an older shape, a 204 coerced to null, etc.) — without this
    // the .map below crashes the whole console.
    if (!Array.isArray(agents) || agents.length === 0) return;

    const subs = agents.map((agent) =>
      subscribeAgent(agent.pubkey, (frame) => {
        setItems((prev) => {
          // Skip dup signatures so reconnect bursts don't re-pump the ticker.
          if (prev.some((p) => p.signature === frame.signature && p.log_index === frame.log_index)) {
            return prev;
          }
          return [frame, ...prev].slice(0, MAX_TICKER);
        });
      }),
    );

    return () => {
      for (const sub of subs) sub.unsubscribe();
    };
  }, [agents]);

  return items;
}
