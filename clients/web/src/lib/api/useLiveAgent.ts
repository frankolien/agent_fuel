import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { EventRow, LiveEventFrame, ScorePoint } from "@/types/api";
import { subscribeAgent, type LiveStatus } from "./live";
import { queryKeys } from "./keys";

const MAX_BUFFERED_ACTIVITY = 200;

type UseLiveAgent = {
  status: LiveStatus;
  /** Frames received since mount, newest first. Used by the topbar ticker. */
  recent: ReadonlyArray<LiveEventFrame>;
};

// Opens a subscription to /ws/agents/:pk, merges frames into the cache:
//   • prepends new events into agent + vault activity lists
//   • appends ScoreComputed samples to the score history
//   • invalidates the agent + reputation base queries so totals refresh
// All cache writes use functional updaters so concurrent queries can't race.
export function useLiveAgent(pubkey: string | undefined): UseLiveAgent {
  const qc = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>("closed");
  const recentRef = useRef<LiveEventFrame[]>([]);
  const [, force] = useState(0);

  useEffect(() => {
    if (!pubkey) return;
    recentRef.current = [];

    const sub = subscribeAgent(
      pubkey,
      (frame) => {
        // ---- Activity (agent view) ----
        qc.setQueriesData<EventRow[]>(
          { queryKey: queryKeys.agentActivity(pubkey) },
          (prev) => mergeEvent(prev, frame),
        );

        // ---- Activity (vault view: any vault whose `agent` matches) ----
        // We don't know which vault pubkey is on screen, so invalidate any
        // vault-activity queries — TanStack refetches lazily on access.
        qc.invalidateQueries({ queryKey: ["vaults"], type: "active", refetchType: "none" });

        // ---- Score history ----
        if (frame.event_name === "ScoreComputed") {
          const score = typeof frame.payload["score"] === "number" ? frame.payload["score"] : null;
          if (score !== null) {
            qc.setQueryData<ScorePoint[]>(queryKeys.agentScoreHistory(pubkey), (prev) => [
              ...(prev ?? []),
              { score, slot: frame.slot, recorded_at: new Date().toISOString() },
            ]);
          }
        }

        // ---- Agent + reputation totals will lag until the next refetch ----
        qc.invalidateQueries({ queryKey: queryKeys.agent(pubkey), refetchType: "none" });
        qc.invalidateQueries({ queryKey: queryKeys.reputation(pubkey), refetchType: "none" });

        recentRef.current = [frame, ...recentRef.current].slice(0, 40);
        force((n) => n + 1);
      },
      setStatus,
    );

    return () => sub.unsubscribe();
  }, [pubkey, qc]);

  return { status, recent: recentRef.current };
}

function mergeEvent(prev: EventRow[] | undefined, frame: LiveEventFrame): EventRow[] {
  const event: EventRow = {
    signature: frame.signature,
    log_index: frame.log_index,
    slot: frame.slot,
    program_id: frame.program_id,
    event_name: frame.event_name,
    payload: frame.payload,
    received_at: new Date().toISOString(),
  };
  if (!prev) return [event];

  // Skip if we already have this signature+log_index — the backend can re-push
  // an event right after a reconnect that already landed via the REST page.
  const dup = prev.some((it) => it.signature === event.signature && it.log_index === event.log_index);
  if (dup) return prev;

  return [event, ...prev].slice(0, MAX_BUFFERED_ACTIVITY);
}
