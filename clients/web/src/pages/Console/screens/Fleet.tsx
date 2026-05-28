import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Agent, EventRow, LiveEventFrame } from "@/types/api";
import { useAgentsQuery } from "@/lib/api/hooks";
import { queryKeys } from "@/lib/api/keys";
import {
  AgentAlreadyInitializedError,
  initializeAgent,
} from "@/lib/owner-actions";
import { AgentModeSelector, type AgentChoice } from "../components/AgentMode";
import { RegisterServiceModal } from "../components/RegisterServiceModal";
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
  const { publicKey } = useWallet();
  const [openModal, setOpenModal] = useState<null | "agent" | "service">(null);

  return (
    <Screen
      eyebrow="Overview"
      title="Fleet"
      subtitle="KPIs, live activity, and the agents you operate."
      actions={
        <div className="flex items-center gap-2.5">
          <LiveBadge status={agentsQuery.isLoading ? "connecting" : "open"} />
          <button
            type="button"
            onClick={() => setOpenModal("service")}
            disabled={!publicKey}
            className="rounded-full border border-[var(--color-line-2)] px-4 py-1.5 text-[12.5px] font-medium text-fg-2 transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Register service
          </button>
          <button
            type="button"
            onClick={() => setOpenModal("agent")}
            disabled={!publicKey}
            className="rounded-full bg-mint px-4 py-1.5 text-[12.5px] font-semibold text-bg transition hover:bg-mint-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Initialize agent
          </button>
        </div>
      }
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
            <EmptyState note='No agents yet. Click "+ Initialize agent" above to create one.' />
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

      {openModal === "agent" && <InitializeAgentModal onClose={() => setOpenModal(null)} />}
      {openModal === "service" && <RegisterServiceModal onClose={() => setOpenModal(null)} />}
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

// ---------- Initialize agent ----------

function InitializeAgentModal({ onClose }: { onClose: () => void }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const qc = useQueryClient();
  const [agentChoice, setAgentChoice] = useState<AgentChoice>({ mode: "wallet" });
  const [uri, setUri] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [createdAgent, setCreatedAgent] = useState<string | null>(null);

  // The URI default tracks the chosen agent pubkey so users see a sensible
  // default but can override.
  const effectiveAgentPk =
    agentChoice.mode === "generate"
      ? agentChoice.keypair.publicKey
      : wallet.publicKey ?? null;
  const uriPlaceholder = effectiveAgentPk
    ? `https://agentfuel.online/agents/${effectiveAgentPk.toBase58()}`
    : "";

  const submitDisabled =
    status === "submitting" ||
    (agentChoice.mode === "generate" && !agentChoice.downloaded);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError("Wallet not connected");
      return;
    }
    setError(null);
    setStatus("submitting");
    try {
      const trimmedUri = uri.trim();
      const sig = await initializeAgent({
        connection,
        wallet: { publicKey: wallet.publicKey, signTransaction: wallet.signTransaction },
        ...(agentChoice.mode === "generate" ? { agentKeypair: agentChoice.keypair } : {}),
        ...(trimmedUri ? { agentUri: trimmedUri } : {}),
      });
      setSignature(sig);
      setCreatedAgent(
        (agentChoice.mode === "generate"
          ? agentChoice.keypair.publicKey
          : wallet.publicKey
        ).toBase58(),
      );
      setStatus("done");
      await qc.invalidateQueries({ queryKey: queryKeys.agents() });
    } catch (err) {
      if (err instanceof AgentAlreadyInitializedError) {
        setError("This agent already has a reputation profile.");
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
      setStatus("idle");
    }
  };

  return (
    <Modal title="Initialize agent" onClose={onClose}>
      {status === "done" ? (
        <DoneState
          signature={signature ?? ""}
          message={`Reputation profile created for ${createdAgent?.slice(0, 4)}…${createdAgent?.slice(-4)}.`}
          onClose={onClose}
        />
      ) : (
        <form onSubmit={onSubmit} className="grid gap-4">
          <AgentModeSelector
            ownerPubkey={wallet.publicKey ?? null}
            onChange={setAgentChoice}
          />
          <Field label="Profile URI (optional)">
            <input
              type="text"
              value={uri}
              onChange={(e) => setUri(e.target.value)}
              placeholder={uriPlaceholder}
              spellCheck={false}
              className="w-full rounded-md border border-[var(--color-line-2)] bg-surface px-3 py-2 font-mono text-[12px] text-fg outline-none focus:border-mint-soft"
            />
            <span className="mt-1 font-mono text-[10.5px] text-muted">
              128 bytes max · leave blank for default
            </span>
          </Field>
          {error && <ErrorLine text={error} />}
          <ModalFooter
            submitLabel={status === "submitting" ? "Submitting…" : "Initialize"}
            submitting={submitDisabled}
            onClose={onClose}
          />
        </form>
      )}
    </Modal>
  );
}

// ---------- Shared modal primitives ----------

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  // Lock body scroll while open + close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] rounded-[16px] border border-[var(--color-line-2)] bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="m-0 text-[16px] font-semibold tracking-[-0.005em]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-fg"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="font-mono text-[10.5px] tracking-[0.06em] text-muted uppercase">{label}</span>
      {children}
    </label>
  );
}

function ModalFooter({
  submitLabel,
  submitting,
  onClose,
}: {
  submitLabel: string;
  submitting: boolean;
  onClose: () => void;
}) {
  return (
    <div className="mt-2 flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        className="rounded-full border border-[var(--color-line)] px-4 py-2 text-[12.5px] text-fg-2 hover:bg-surface-2"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-full bg-mint px-4 py-2 text-[12.5px] font-semibold text-bg hover:bg-mint-soft disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitLabel}
      </button>
    </div>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-[#E0857733] bg-[#E0857714] px-3 py-2 text-[12px] text-[#E08577]">
      {text}
    </div>
  );
}

function DoneState({
  signature,
  message,
  onClose,
}: {
  signature: string;
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="grid gap-4">
      <p className="m-0 text-[14px] text-fg-2">{message}</p>
      <a
        href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
        target="_blank"
        rel="noopener noreferrer"
        className="block truncate font-mono text-[11.5px] text-mint hover:underline"
      >
        {signature}
      </a>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-mint px-4 py-2 text-[12.5px] font-semibold text-bg hover:bg-mint-soft"
        >
          Done
        </button>
      </div>
    </div>
  );
}
