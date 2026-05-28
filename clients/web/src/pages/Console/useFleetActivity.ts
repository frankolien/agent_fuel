// Merges historical activity (per-agent REST fetch) with live WS frames into a
// single sorted feed for the Activity screen. The topbar marquee uses
// useFleetTicker directly — that's live-only by design.

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useAgentsQuery } from "@/lib/api/hooks";
import { queryKeys } from "@/lib/api/keys";
import { HttpError } from "@/lib/http";
import type { EventRow, LiveEventFrame } from "@/types/api";
import { useFleetTicker } from "./useFleetTicker";

export type FleetActivityRow = EventRow & { agent_pubkey: string };

export type FleetActivity = {
  rows: FleetActivityRow[];
  isLoading: boolean;
  liveCount: number;
};

const PER_AGENT_LIMIT = 25;

export function useFleetActivity(): FleetActivity {
  const agentsQuery = useAgentsQuery();
  const agents = Array.isArray(agentsQuery.data) ? agentsQuery.data : [];
  const live = useFleetTicker();

  const histories = useQueries({
    queries: agents.map((agent) => ({
      queryKey: [...queryKeys.agentActivity(agent.pubkey), "head"],
      queryFn: async (): Promise<EventRow[]> => {
        try {
          return await api.agentActivity(agent.pubkey, {});
        } catch (err) {
          // 404 = agent not (yet) in the backend's `agents` table — common
          // for chain-fallback discoveries before the indexer catches up.
          // Treat as "no history" so live frames still surface.
          if (err instanceof HttpError && err.status === 404) return [];
          throw err;
        }
      },
      // Activity rows are append-only; a short stale window keeps the screen
      // snappy without hammering the backend on every focus change.
      staleTime: 15_000,
      // Don't retry 404s — they indicate a real "not indexed" state that won't
      // change until the next webhook fires (which will invalidate this query
      // through the live merge anyway).
      retry: (count: number, err: unknown) => {
        if (err instanceof HttpError && err.status === 404) return false;
        return count < 2;
      },
    })),
  });

  const rows = useMemo<FleetActivityRow[]>(() => {
    const merged = new Map<string, FleetActivityRow>();

    // Historical first — live frames will overwrite by key if they collide,
    // which is the right precedence (live carries the freshest payload).
    histories.forEach((q, i) => {
      const owner = agents[i]?.pubkey;
      if (!owner) return;
      const data = Array.isArray(q.data) ? q.data : [];
      for (const row of data) {
        merged.set(key(row.signature, row.log_index), {
          ...row,
          agent_pubkey: pickAgent(row, owner),
        });
      }
    });

    for (const frame of live) {
      const k = key(frame.signature, frame.log_index);
      if (!merged.has(k)) {
        merged.set(k, frameToRow(frame, fallbackOwner(frame, agents.map((a) => a.pubkey))));
      }
    }

    return Array.from(merged.values())
      .sort((a, b) => b.slot - a.slot || b.log_index - a.log_index)
      .slice(0, PER_AGENT_LIMIT * Math.max(1, agents.length));
  }, [agents, histories, live]);

  return {
    rows,
    isLoading: agentsQuery.isLoading || histories.some((q) => q.isLoading),
    liveCount: live.length,
  };
}

function key(sig: string, idx: number): string {
  return `${sig}:${idx}`;
}

// `agent` in an event payload is the on-chain reputation pubkey — same value
// the activity endpoint was scoped by. Fall back to the scoping owner if the
// payload doesn't carry one (defensive; current events all do).
function pickAgent(row: EventRow, owner: string): string {
  const fromPayload = row.payload["agent"];
  return typeof fromPayload === "string" ? fromPayload : owner;
}

function fallbackOwner(frame: LiveEventFrame, owned: string[]): string {
  const fromPayload = frame.payload["agent"];
  if (typeof fromPayload === "string" && owned.includes(fromPayload)) return fromPayload;
  return owned[0] ?? "";
}

function frameToRow(frame: LiveEventFrame, agentPubkey: string): FleetActivityRow {
  return {
    signature: frame.signature,
    log_index: frame.log_index,
    slot: frame.slot,
    program_id: frame.program_id,
    event_name: frame.event_name,
    payload: frame.payload,
    // No persisted timestamp for in-flight frames — the renderer can fall back
    // to slot-relative formatting via referenceSlot anyway.
    received_at: new Date().toISOString(),
    agent_pubkey: agentPubkey,
  };
}
