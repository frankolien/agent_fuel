// Merges historical activity (per-agent REST fetch) with live WS frames into a
// single sorted feed for the Activity screen. The topbar marquee uses
// useFleetTicker directly — that's live-only by design.

import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/app/auth";
import { api } from "@/lib/api/client";
import { useAgentsQuery } from "@/lib/api/hooks";
import { queryKeys } from "@/lib/api/keys";
import { HttpError } from "@/lib/http";
import type { Agent, EventRow, LiveEventFrame } from "@/types/api";
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
  // `useAgentsQuery` can return undefined or (after a coerce path) a fresh
  // array each render — wrap in useMemo so the downstream useMemo deps
  // don't re-fire on every parent render.
  const agentsData = agentsQuery.data;
  const agents = useMemo(
    () => (Array.isArray(agentsData) ? agentsData : []),
    [agentsData],
  );
  const live = useFleetTicker();

  // The merged agents list (useAgentsQuery) can include chain-discovered
  // agents the backend has never indexed — fetching /activity for those
  // would 404 every time. Re-query the canonical backend list separately so
  // we only fan activity calls out to agents we know the backend knows.
  const backendKnown = useBackendKnownAgents();
  const indexedAgents = useMemo(
    () => agents.filter((a) => backendKnown.has(a.pubkey)),
    [agents, backendKnown],
  );

  const histories = useQueries({
    queries: indexedAgents.map((agent) => ({
      queryKey: [...queryKeys.agentActivity(agent.pubkey), "head"],
      queryFn: async (): Promise<EventRow[]> => {
        try {
          return await api.agentActivity(agent.pubkey, {});
        } catch (err) {
          // Belt-and-suspenders: a 404 here means the row was deleted between
          // listAgents and activity (rare). Treat as empty rather than throwing.
          if (err instanceof HttpError && err.status === 404) return [];
          throw err;
        }
      },
      // Activity rows are append-only; a short stale window keeps the screen
      // snappy without hammering the backend on every focus change.
      staleTime: 15_000,
    })),
  });

  const rows = useMemo<FleetActivityRow[]>(() => {
    const merged = new Map<string, FleetActivityRow>();

    // Historical first — live frames will overwrite by key if they collide,
    // which is the right precedence (live carries the freshest payload).
    histories.forEach((q, i) => {
      const owner = indexedAgents[i]?.pubkey;
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
  }, [agents, indexedAgents, histories, live]);

  return {
    rows,
    isLoading: agentsQuery.isLoading || histories.some((q) => q.isLoading),
    liveCount: live.length,
  };
}

// Set of agent pubkeys the backend currently has indexed for this owner.
// Used to skip /activity fan-outs for chain-only agents (avoids the 404s
// that previously littered the access log).
function useBackendKnownAgents(): Set<string> {
  const { walletPubkey } = useAuth();
  const query = useQuery({
    queryKey: walletPubkey
      ? ["agents", "indexed-set", walletPubkey]
      : ["agents", "indexed-set", "anon"],
    queryFn: async () => {
      try {
        const rows = await api.listAgents();
        return Array.isArray(rows) ? rows.map((r: Agent) => r.pubkey) : [];
      } catch {
        return [];
      }
    },
    enabled: !!walletPubkey,
    staleTime: 30_000,
  });
  return useMemo(() => new Set(query.data ?? []), [query.data]);
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
