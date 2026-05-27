import { Link } from "react-router-dom";
import { formatNumberCompact, formatUsdcCompact, shortPubkey } from "@/lib/format";
import type { Agent } from "@/types/api";
import { ScoreBadge, tierFor } from "./ScoreBadge";

type AgentCardProps = {
  agent: Agent;
};

export function AgentCard({ agent }: AgentCardProps) {
  const { tone } = tierFor(agent.score);
  return (
    <Link
      to={`/console/agents/${agent.pubkey}`}
      className="grid gap-4 rounded-[12px] border border-white/[0.09] bg-[#0e0f11] p-4 transition-[background-color,border-color,transform] duration-150 ease-out hover:-translate-y-px hover:border-white/[0.16] hover:bg-surface-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-0.5">
          <span className="truncate font-mono text-[13px] text-fg">{shortPubkey(agent.pubkey, 6)}</span>
          <span className="truncate font-mono text-[11px] text-muted">
            {agent.services_used} svc · {formatNumberCompact(agent.consecutive_success)} streak
          </span>
        </div>
        <ScoreBadge score={agent.score} />
      </div>

      <div className="flex items-baseline gap-2">
        <span className={`font-mono text-[36px] leading-none font-medium tracking-[-0.025em] ${tone}`}>
          {agent.score === null ? "—" : String(agent.score).padStart(3, "0")}
        </span>
        <span className="font-mono text-[11px] text-muted">/ 1000</span>
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-white/[0.05] pt-3">
        <Stat label="Volume" value={formatUsdcCompact(agent.total_volume_usdc)} />
        <Stat label="Tx" value={formatNumberCompact(agent.total_transactions)} />
        <Stat label="Feedback" value={formatNumberCompact(agent.total_feedback_count)} />
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <span className="font-mono text-[10px] tracking-[0.06em] text-muted uppercase">{label}</span>
      <span className="font-mono text-[12.5px] text-fg-2">{value}</span>
    </div>
  );
}
