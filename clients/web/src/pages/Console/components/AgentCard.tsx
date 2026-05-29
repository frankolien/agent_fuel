import { Link } from "react-router-dom";
import { formatNumberCompact, formatUsdcCompact, shortPubkey } from "@/lib/format";
import type { Agent } from "@/types/api";
import { tierFor } from "@/lib/tier";

export type AgentStatus = "active" | "watch" | "frozen" | "dormant";

export type EnrichedAgent = {
  agent: Agent;
  vaultBalanceUsd: number;        // micro-USDC
  spend24hUsd: number;            // micro-USDC
  tx24h: number;
  scoreDelta24h: number | null;   // null when there's no prior score in window
  status: AgentStatus;
};

const PROGRESS_MAX = 1000;

export function AgentCard({ data }: { data: EnrichedAgent }) {
  const { agent, vaultBalanceUsd, spend24hUsd, tx24h, scoreDelta24h, status } = data;
  const { tone } = tierFor(agent.score);
  const scored = agent.score > 0;
  const scoreFraction = Math.max(0, Math.min(1, agent.score / PROGRESS_MAX));

  return (
    <Link
      to={`/console/agents/${agent.pubkey}`}
      className={`grid gap-3.5 rounded-[12px] border border-white/[0.09] bg-[#0e0f11] p-4 transition-[background-color,border-color,transform] duration-150 ease-out hover:-translate-y-px hover:border-white/[0.16] hover:bg-surface-2 ${
        status === "frozen" ? "opacity-70" : ""
      }`}
    >
      {/* Header: identifier + status */}
      <div className="flex items-start justify-between gap-3">
        <span className="truncate font-mono text-[13.5px] text-fg">
          {shortPubkey(agent.pubkey, 6)}
        </span>
        <StatusPill status={status} />
      </div>

      {/* Hero: score + 24h delta */}
      <div className="flex items-baseline gap-3">
        <span
          className={`font-mono text-[36px] leading-none font-medium tracking-[-0.025em] ${
            scored ? tone : "text-muted"
          }`}
        >
          {scored ? String(agent.score).padStart(3, "0") : "—"}
        </span>
        <div className="grid gap-0.5">
          <span className="font-mono text-[10.5px] tracking-[0.06em] text-muted uppercase">
            reputation · 24h
          </span>
          <DeltaChip delta={scoreDelta24h} />
        </div>
      </div>

      {/* Score progress bar */}
      <div className="h-[4px] overflow-hidden rounded-sm bg-surface-2" aria-hidden="true">
        <div
          className={`h-full ${
            scored
              ? "bg-mint [box-shadow:0_0_10px_rgba(166,225,207,0.4)]"
              : "bg-surface-3"
          }`}
          style={{ width: `${scoreFraction * 100}%` }}
        />
      </div>

      {/* 3-column stats */}
      <div className="grid grid-cols-3 gap-2 border-t border-white/[0.05] pt-3">
        <Stat label="Vault" value={`$${formatUsdcCompact(vaultBalanceUsd)}`} />
        <Stat label="24h spend" value={`$${formatUsdcCompact(spend24hUsd)}`} />
        <Stat label="24h tx" value={formatNumberCompact(tx24h)} />
      </div>
    </Link>
  );
}

function StatusPill({ status }: { status: AgentStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/[0.09] bg-surface-2 px-2.5 py-1 font-mono text-[10px] tracking-[0.06em] uppercase ${meta.tone}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${meta.pulse}`} />
      {meta.label}
    </span>
  );
}

const STATUS_META: Record<AgentStatus, { label: string; tone: string; pulse: string }> = {
  active: {
    label: "Active",
    tone: "text-mint",
    pulse: "[box-shadow:0_0_8px_var(--color-mint-glow)] animate-pulse",
  },
  watch: { label: "Watch", tone: "text-[#E6B86F]", pulse: "opacity-80" },
  frozen: { label: "Frozen", tone: "text-muted", pulse: "opacity-60" },
  dormant: { label: "Unscored", tone: "text-muted", pulse: "opacity-50" },
};

function DeltaChip({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span className="font-mono text-[12px] text-muted">▲ 0</span>;
  }
  if (delta > 0) {
    return <span className="font-mono text-[12px] text-mint">▲ +{delta}</span>;
  }
  if (delta < 0) {
    return <span className="font-mono text-[12px] text-[#E08577]">▼ {delta}</span>;
  }
  return <span className="font-mono text-[12px] text-muted">▲ 0</span>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <span className="font-mono text-[9.5px] tracking-[0.06em] text-muted uppercase">{label}</span>
      <span className="font-mono text-[12.5px] text-fg-2 tabular-nums">{value}</span>
    </div>
  );
}
