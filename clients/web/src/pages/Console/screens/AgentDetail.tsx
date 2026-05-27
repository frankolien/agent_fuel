import { Link, useParams } from "react-router-dom";
import {
  useAgentActivityQuery,
  useAgentQuery,
  useAgentScoreHistoryQuery,
} from "@/lib/api/hooks";
import { useLiveAgent } from "@/lib/api/useLiveAgent";
import {
  formatDate,
  formatNumber,
  formatNumberCompact,
  formatUsdcCompact,
  shortPubkey,
} from "@/lib/format";
import type { Agent, EventRow, ScorePoint } from "@/types/api";
import { Screen } from "./Screen";
import { ActivityRow } from "../components/ActivityRow";
import { AddressPill } from "../components/AddressPill";
import { Card } from "../components/Card";
import { LiveBadge } from "../components/LiveBadge";
import { Kpi, KpiStrip } from "../components/Kpi";
import { ScoreBadge, tierFor } from "../components/ScoreBadge";
import { Skeleton, SkeletonRows } from "../components/Skeleton";
import { Sparkline } from "../components/Sparkline";

export function AgentDetail() {
  const { pubkey = "" } = useParams<{ pubkey: string }>();
  const agentQuery = useAgentQuery(pubkey);
  const activityQuery = useAgentActivityQuery(pubkey);
  const historyQuery = useAgentScoreHistoryQuery(pubkey);
  const live = useLiveAgent(pubkey);

  if (agentQuery.error) {
    return (
      <Screen title="Agent not found" subtitle="That pubkey isn't in your roster.">
        <Link to="/console/agents" className="text-mint hover:text-fg">
          ← Back to agents
        </Link>
      </Screen>
    );
  }

  return (
    <Screen
      eyebrow={
        <>
          <Link to="/console/agents" className="hover:text-fg">
            Agents
          </Link>
          <span className="text-muted">/</span>
          <span className="font-mono">{shortPubkey(pubkey)}</span>
        </>
      }
      title={agentQuery.data ? `Agent ${shortPubkey(agentQuery.data.pubkey)}` : "Agent"}
      subtitle={agentQuery.data ? `Owner ${shortPubkey(agentQuery.data.owner)}` : "Loading…"}
      actions={agentQuery.data ? <HeaderActions agent={agentQuery.data} live={live} /> : null}
    >
      {agentQuery.isLoading ? <HeroSkeleton /> : null}
      {agentQuery.data ? <AgentKpis agent={agentQuery.data} /> : null}

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.4fr_1fr]">
        <Card
          title="Score history"
          meta={historyQuery.data ? `${historyQuery.data.length} samples` : "—"}
        >
          {historyQuery.isLoading ? (
            <Skeleton className="h-[140px] w-full" />
          ) : historyQuery.data && historyQuery.data.length > 0 ? (
            <ScorePanel history={historyQuery.data} />
          ) : (
            <EmptyState note="No score samples yet — compute_score hasn't run for this agent." />
          )}
        </Card>

        <Card title="Identifiers">
          {agentQuery.data ? (
            <div className="grid gap-2">
              <AddressPill label="agent" address={agentQuery.data.pubkey} />
              <AddressPill label="owner" address={agentQuery.data.owner} />
              <div className="mt-3 grid grid-cols-2 gap-3 text-[12.5px]">
                <Pair label="First active" value={`slot ${formatNumberCompact(agentQuery.data.init_slot)}`} />
                <Pair label="Last active" value={`slot ${formatNumberCompact(agentQuery.data.last_active_slot)}`} />
                <Pair label="Updated" value={formatDate(agentQuery.data.updated_at)} />
                <Pair label="Feedback" value={`${agentQuery.data.total_feedback_count} (${agentQuery.data.active_negative_feedback_count} neg)`} />
              </div>
            </div>
          ) : (
            <Skeleton className="h-[100px] w-full" />
          )}
        </Card>
      </div>

      <div className="mt-3.5">
        <Card title="Activity" meta={activityQuery.data ? `${activityQuery.data.length} recent` : "—"}>
          {activityQuery.isLoading ? (
            <SkeletonRows rows={6} height={36} />
          ) : activityQuery.data && activityQuery.data.length > 0 ? (
            <ActivityList
              referenceSlot={agentQuery.data?.last_active_slot ?? activityQuery.data[0]!.slot}
              items={activityQuery.data}
            />
          ) : (
            <EmptyState note="No events for this agent yet." />
          )}
        </Card>
      </div>
    </Screen>
  );
}

function AgentKpis({ agent }: { agent: Agent }) {
  return (
    <KpiStrip>
      <Kpi
        hero
        label="Reputation score"
        value={
          <span className="flex items-baseline gap-3">
            <span>{agent.score === 0 ? "—" : String(agent.score).padStart(3, "0")}</span>
            <ScoreBadge score={agent.score} />
          </span>
        }
        sub={`Tier: ${tierFor(agent.score).label.toLowerCase()}`}
      />
      <Kpi
        label="Lifetime spend"
        value={formatUsdcCompact(agent.total_volume_usdc)}
        sub={`${formatNumber(agent.total_transactions)} transactions`}
      />
      <Kpi
        label="Consecutive success"
        value={formatNumberCompact(agent.consecutive_success)}
        sub={`${agent.services_used} unique services`}
      />
      <Kpi
        label="Feedback"
        value={formatNumber(agent.total_feedback_count)}
        sub={`${agent.active_negative_feedback_count} active negative`}
      />
    </KpiStrip>
  );
}

function ScorePanel({ history }: { history: ScorePoint[] }) {
  // History from the backend is unordered; sort by slot for a coherent line.
  const sorted = [...history].sort((a, b) => a.slot - b.slot);
  const values = sorted.map((row) => row.score);
  const latest = sorted[sorted.length - 1]!.score;
  const first = sorted[0]!.score;
  const delta = latest - first;
  return (
    <div className="grid gap-3">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[26px] font-medium tracking-[-0.02em] text-mint [text-shadow:0_0_24px_rgba(166,225,207,0.3)]">
          {String(latest).padStart(3, "0")}
        </span>
        <span
          className={
            "font-mono text-[12px] " + (delta >= 0 ? "text-mint" : "text-[#E08577]")
          }
        >
          {delta >= 0 ? "▲" : "▼"} {delta >= 0 ? "+" : ""}
          {delta} since first sample
        </span>
      </div>
      <Sparkline values={values} height={120} />
    </div>
  );
}

function ActivityList({ items, referenceSlot }: { items: ReadonlyArray<EventRow>; referenceSlot: number }) {
  return (
    <div>
      {items.map((event) => (
        <ActivityRow
          key={`${event.signature}:${event.log_index}`}
          event={event}
          referenceSlot={referenceSlot}
        />
      ))}
    </div>
  );
}

function HeaderActions({ agent, live }: { agent: Agent; live: ReturnType<typeof useLiveAgent> }) {
  return (
    <div className="flex items-center gap-2">
      <LiveBadge status={live.status} />
      <Link
        to={`/reputation/${agent.pubkey}`}
        className="inline-flex h-8 items-center rounded-md border border-white/[0.16] bg-surface-2 px-3 font-mono text-[11.5px] text-fg-2 hover:bg-surface-3"
      >
        Public profile ↗
      </Link>
    </div>
  );
}

function HeroSkeleton() {
  return (
    <KpiStrip>
      <Skeleton className="h-[172px] w-full" />
      <Skeleton className="h-[172px] w-full" />
      <Skeleton className="h-[172px] w-full" />
      <Skeleton className="h-[172px] w-full" />
    </KpiStrip>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <span className="font-mono text-[10.5px] tracking-[0.06em] text-muted uppercase">{label}</span>
      <span className="font-mono text-[12.5px] text-fg-2">{value}</span>
    </div>
  );
}

function EmptyState({ note }: { note: string }) {
  return (
    <div className="rounded-md border border-dashed border-white/[0.09] bg-surface/40 px-4 py-8 text-center text-[12.5px] text-muted">
      {note}
    </div>
  );
}

