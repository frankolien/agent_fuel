import { Link } from "react-router-dom";
import { useAgentsQuery } from "@/lib/api/hooks";
import { Screen } from "./Screen";
import { ActivityRow } from "../components/ActivityRow";
import { Card } from "../components/Card";
import { LiveBadge } from "../components/LiveBadge";
import { SkeletonRows } from "../components/Skeleton";
import { useFleetActivity, type FleetActivityRow } from "../useFleetActivity";

export function Activity() {
  const agentsQuery = useAgentsQuery();
  const { rows, isLoading, liveCount } = useFleetActivity();
  const agentCount = Array.isArray(agentsQuery.data) ? agentsQuery.data.length : 0;

  return (
    <Screen
      eyebrow="Live"
      title="Activity"
      subtitle="Every spend, claim, and score update across your fleet."
      actions={<LiveBadge status={isLoading ? "connecting" : "open"} />}
    >
      <Card
        title="Recent"
        meta={`${rows.length} events · ${liveCount} live · ${agentCount} agents`}
      >
        {isLoading && rows.length === 0 ? (
          <SkeletonRows rows={6} height={36} />
        ) : rows.length === 0 ? (
          <EmptyState agentCount={agentCount} />
        ) : (
          <FeedList rows={rows} />
        )}
      </Card>
    </Screen>
  );
}

function EmptyState({ agentCount }: { agentCount: number }) {
  if (agentCount === 0) {
    return (
      <div className="rounded-md border border-dashed border-white/[0.09] bg-surface/40 px-4 py-12 text-center text-[12.5px] text-muted">
        No agents yet. Initialize one to start streaming activity here.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-dashed border-white/[0.09] bg-surface/40 px-4 py-12 text-center text-[12.5px] text-muted">
      Listening on <span className="font-mono text-fg-2">{agentCount}</span>{" "}
      {agentCount === 1 ? "agent" : "agents"}. No events recorded yet — spend or claim to
      see them appear.
    </div>
  );
}

function FeedList({ rows }: { rows: FleetActivityRow[] }) {
  const ref = rows[0]!.slot;
  return (
    <div>
      {rows.map((row) => (
        <div
          key={`${row.signature}:${row.log_index}`}
          className="grid grid-cols-[110px_1fr] items-center gap-2 sm:grid-cols-[140px_1fr] sm:gap-3"
        >
          {row.agent_pubkey ? (
            <Link
              to={`/console/agents/${row.agent_pubkey}`}
              className="truncate font-mono text-[11.5px] text-mint-soft hover:text-mint"
            >
              {short(row.agent_pubkey)}
            </Link>
          ) : (
            <span className="font-mono text-[11.5px] text-muted">—</span>
          )}
          <ActivityRow event={row} referenceSlot={ref} />
        </div>
      ))}
    </div>
  );
}

function short(pk: string): string {
  return pk.length > 12 ? `${pk.slice(0, 6)}…${pk.slice(-4)}` : pk;
}
