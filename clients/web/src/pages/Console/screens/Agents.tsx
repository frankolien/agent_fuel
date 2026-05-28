import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAgentsQuery } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/error";
import { formatNumber, formatNumberCompact, formatUsdcCompact, shortPubkey } from "@/lib/format";
import type { Agent } from "@/types/api";
import { Screen } from "./Screen";
import { tierFor } from "@/lib/tier";
import { ScoreBadge } from "../components/ScoreBadge";
import { SkeletonRows } from "../components/Skeleton";

export function Agents() {
  const { data, isLoading, error } = useAgentsQuery();

  return (
    <Screen
      eyebrow="Roster"
      title="Agents"
      subtitle="All agents under this organisation."
      actions={
        data ? (
          <span className="font-mono text-[11.5px] tracking-[0.06em] text-muted uppercase">
            {data.length} total
          </span>
        ) : null
      }
    >
      {isLoading ? <SkeletonRows rows={6} height={56} /> : null}
      {error ? <ErrorState message={errorMessage(error)} /> : null}
      {data ? <AgentsTable agents={data} /> : null}
    </Screen>
  );
}

function AgentsTable({ agents }: { agents: ReadonlyArray<Agent> }) {
  if (agents.length === 0) {
    return (
      <div className="grid place-items-center rounded-[10px] border border-dashed border-white/[0.09] bg-surface/40 px-6 py-20 text-center text-[13px] text-muted">
        No agents yet. Initialize one with the SDK to get started.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[10px] border border-white/[0.09] bg-[#0e0f11]">
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left">
            <Th>Agent</Th>
            <Th>Score</Th>
            <Th align="right">Transactions</Th>
            <Th align="right">Volume</Th>
            <Th align="right">Services</Th>
            <Th align="right">Streak</Th>
            <Th align="right">Last active</Th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent) => (
            <AgentRow key={agent.pubkey} agent={agent} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgentRow({ agent }: { agent: Agent }) {
  return (
    <tr className="border-t border-white/[0.05] hover:bg-white/[0.02]">
      <Td>
        <Link
          to={`/console/agents/${agent.pubkey}`}
          className="grid gap-0.5 hover:text-fg"
        >
          <span className="font-mono text-[13px] text-fg">{shortPubkey(agent.pubkey)}</span>
          <span className="font-mono text-[11px] text-muted">owner {shortPubkey(agent.owner)}</span>
        </Link>
      </Td>
      <Td>
        <div className="flex items-center gap-2">
          <span className={`font-mono text-[16px] tabular-nums ${tierFor(agent.score).tone}`}>
            {agent.score === 0 ? "—" : String(agent.score).padStart(3, "0")}
          </span>
          <ScoreBadge score={agent.score} />
        </div>
      </Td>
      <Td align="right">
        <span className="font-mono text-[13px]">{formatNumberCompact(agent.total_transactions)}</span>
      </Td>
      <Td align="right">
        <span className="font-mono text-[13px]">{formatUsdcCompact(agent.total_volume_usdc)}</span>
      </Td>
      <Td align="right">
        <span className="font-mono text-[13px]">{formatNumber(agent.services_used)}</span>
      </Td>
      <Td align="right">
        <span className="font-mono text-[13px]">{formatNumber(agent.consecutive_success)}</span>
      </Td>
      <Td align="right">
        <span className="font-mono text-[12px] text-muted">slot {formatNumberCompact(agent.last_active_slot)}</span>
      </Td>
    </tr>
  );
}

function Th({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={
        "px-4 py-3 font-mono text-[11px] font-normal tracking-[0.06em] text-muted uppercase " +
        (align === "right" ? "text-right" : "text-left")
      }
    >
      {children}
    </th>
  );
}

function Td({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" }) {
  return <td className={"px-4 py-3 align-middle " + (align === "right" ? "text-right" : "")}>{children}</td>;
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-[10px] border border-[#E0857733] bg-[#E0857714] px-4 py-3 text-[13px] text-[#E08577]">
      Couldn't load agents — <span className="font-mono">{message}</span>
    </div>
  );
}

