import { Link } from "react-router-dom";
import type { EventRow, LiveEventFrame } from "@/types/api";
import { useAgentsQuery } from "@/lib/api/hooks";
import { Screen } from "./Screen";
import { ActivityRow } from "../components/ActivityRow";
import { Card } from "../components/Card";
import { LiveBadge } from "../components/LiveBadge";
import { SkeletonRows } from "../components/Skeleton";
import { useFleetTicker } from "../useFleetTicker";

export function Activity() {
  const agentsQuery = useAgentsQuery();
  const frames = useFleetTicker();

  return (
    <Screen
      eyebrow="Live"
      title="Activity"
      subtitle="Every spend, claim, and score update across your fleet."
      actions={<LiveBadge status={frames.length > 0 ? "open" : agentsQuery.isLoading ? "connecting" : "open"} />}
    >
      <Card title="Recent" meta={`${frames.length} frames buffered`}>
        {agentsQuery.isLoading ? (
          <SkeletonRows rows={6} height={36} />
        ) : frames.length === 0 ? (
          <div className="rounded-md border border-dashed border-white/[0.09] bg-surface/40 px-4 py-12 text-center text-[12.5px] text-muted">
            Listening on{" "}
            <span className="font-mono text-fg-2">{agentsQuery.data?.length ?? 0}</span> agents.
            Waiting for the first event…
          </div>
        ) : (
          <FrameList frames={frames} />
        )}
      </Card>
    </Screen>
  );
}

function FrameList({ frames }: { frames: ReadonlyArray<LiveEventFrame> }) {
  const ref = frames[0]!.slot;
  return (
    <div>
      {frames.map((frame) => {
        const agent = typeof frame.payload["agent"] === "string" ? frame.payload["agent"] : null;
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
          <div
            key={`${frame.signature}:${frame.log_index}`}
            className="grid grid-cols-[140px_1fr] items-center gap-3"
          >
            {agent ? (
              <Link
                to={`/console/agents/${agent}`}
                className="truncate font-mono text-[11.5px] text-mint-soft hover:text-mint"
              >
                {short(agent)}
              </Link>
            ) : (
              <span className="font-mono text-[11.5px] text-muted">—</span>
            )}
            <ActivityRow event={event} referenceSlot={ref} />
          </div>
        );
      })}
    </div>
  );
}

function short(pk: string): string {
  return pk.length > 12 ? `${pk.slice(0, 6)}…${pk.slice(-4)}` : pk;
}
