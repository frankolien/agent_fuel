import { useMemo } from "react";
import type { Agent, EventRow, LiveEventFrame } from "@/types/api";
import { useAgentsQuery } from "@/lib/api/hooks";
import { formatNumberCompact, formatUsdcCompact } from "@/lib/format";
import { Screen } from "./Screen";
import { ActivityRow } from "../components/ActivityRow";
import { AgentCard } from "../components/AgentCard";
import { Card } from "../components/Card";
import { Kpi, KpiStrip } from "../components/Kpi";
import { LiveBadge } from "../components/LiveBadge";
import { Skeleton, SkeletonRows } from "../components/Skeleton";
import { useFleetTicker } from "../useFleetTicker";

export function Fleet() {
  const agentsQuery = useAgentsQuery();
  const frames = useFleetTicker();

  return (
    <Screen
      eyebrow="Overview"
      title="Fleet"
      subtitle="KPIs, live activity, and the agents you operate."
      actions={<LiveBadge status={agentsQuery.isLoading ? "connecting" : "open"} />}
    >
      {agentsQuery.isLoading ? <KpiSkeleton /> : null}
      {agentsQuery.data ? <FleetKpis agents={agentsQuery.data} /> : null}

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1fr_380px]">
        <Card
          title="Agents"
          meta={agentsQuery.data ? `${agentsQuery.data.length} total` : "—"}
        >
          {agentsQuery.isLoading ? (
            <SkeletonRows rows={3} height={140} />
          ) : agentsQuery.data && agentsQuery.data.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {agentsQuery.data.map((agent) => (
                <AgentCard key={agent.pubkey} agent={agent} />
              ))}
            </div>
          ) : (
            <EmptyState note="No agents yet. Initialize one with the SDK to get started." />
          )}
        </Card>

        <Card title="Live activity" meta={`${frames.length} buffered`}>
          {frames.length === 0 ? (
            <div className="rounded-md border border-dashed border-white/[0.09] bg-surface/40 px-3 py-10 text-center text-[12.5px] text-muted">
              Waiting for the first event…
            </div>
          ) : (
            <FrameStream frames={frames} />
          )}
        </Card>
      </div>
    </Screen>
  );
}

function FleetKpis({ agents }: { agents: ReadonlyArray<Agent> }) {
  const stats = useMemo(() => deriveStats(agents), [agents]);
  return (
    <KpiStrip>
      <Kpi
        hero
        label="Fleet average score"
        value={stats.averageScore !== null ? String(stats.averageScore).padStart(3, "0") : "—"}
        sub={stats.scoredCount > 0 ? `${stats.scoredCount} / ${agents.length} agents scored` : "no scores yet"}
      />
      <Kpi
        label="Lifetime volume"
        value={formatUsdcCompact(stats.totalVolume)}
        sub={`${formatNumberCompact(stats.totalTransactions)} transactions`}
      />
      <Kpi
        label="Active agents"
        value={String(stats.activeCount)}
        sub={`${agents.length - stats.activeCount} dormant`}
      />
      <Kpi
        label="Total feedback"
        value={formatNumberCompact(stats.totalFeedback)}
        sub={`${stats.totalNegativeFeedback} active negative`}
      />
    </KpiStrip>
  );
}

type FleetStats = {
  averageScore: number | null;
  scoredCount: number;
  totalVolume: number;
  totalTransactions: number;
  activeCount: number;
  totalFeedback: number;
  totalNegativeFeedback: number;
};

function deriveStats(agents: ReadonlyArray<Agent>): FleetStats {
  let scoreSum = 0;
  let scored = 0;
  let totalVolume = 0;
  let totalTx = 0;
  let active = 0;
  let totalFeedback = 0;
  let totalNeg = 0;
  for (const a of agents) {
    // Treat score=0 as "unscored": the mirror table defaults score to 0 before
    // `compute_score` ever runs, so averaging zero would drag the fleet metric down.
    if (a.score > 0) {
      scoreSum += a.score;
      scored += 1;
    }
    totalVolume += a.total_volume_usdc;
    totalTx += a.total_transactions;
    if (a.total_transactions > 0) active += 1;
    totalFeedback += a.total_feedback_count;
    totalNeg += a.active_negative_feedback_count;
  }
  return {
    averageScore: scored > 0 ? Math.round(scoreSum / scored) : null,
    scoredCount: scored,
    totalVolume,
    totalTransactions: totalTx,
    activeCount: active,
    totalFeedback,
    totalNegativeFeedback: totalNeg,
  };
}

function FrameStream({ frames }: { frames: ReadonlyArray<LiveEventFrame> }) {
  const ref = frames[0]!.slot;
  return (
    <div>
      {frames.slice(0, 12).map((frame) => {
        const event: EventRow = {
          signature: frame.signature,
          log_index: frame.log_index,
          slot: frame.slot,
          program_id: frame.program_id,
          event_name: frame.event_name,
          payload: frame.payload,
          received_at: new Date().toISOString(),
        };
        return (
          <ActivityRow
            key={`${frame.signature}:${frame.log_index}`}
            event={event}
            referenceSlot={ref}
          />
        );
      })}
    </div>
  );
}

function KpiSkeleton() {
  return (
    <KpiStrip>
      <Skeleton className="h-[172px] w-full" />
      <Skeleton className="h-[172px] w-full" />
      <Skeleton className="h-[172px] w-full" />
      <Skeleton className="h-[172px] w-full" />
    </KpiStrip>
  );
}

function EmptyState({ note }: { note: string }) {
  return (
    <div className="grid place-items-center rounded-[10px] border border-dashed border-white/[0.09] bg-surface/40 px-6 py-20 text-center text-[13px] text-muted">
      {note}
    </div>
  );
}
