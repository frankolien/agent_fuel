import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAgentActivityQuery,
  useAgentQuery,
  useAgentScoreHistoryQuery,
  useAgentVaultsQuery,
} from "@/lib/api/hooks";
import { queryKeys } from "@/lib/api/keys";
import { useLiveAgent } from "@/lib/api/useLiveAgent";
import { createVault } from "@/lib/owner-actions";
import {
  formatDate,
  formatNumber,
  formatNumberCompact,
  formatUsdc,
  formatUsdcCompact,
  shortPubkey,
} from "@/lib/format";
import { vaultBalance, type Agent, type EventRow, type ScorePoint, type Vault } from "@/types/api";

const DEFAULT_DEVNET_USDC_MINT = "GxAHHLN4qZtiHXKiTNFebXbbMWzgFBy4AGaiDJEY8xdf";
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
  const vaultsQuery = useAgentVaultsQuery(pubkey);
  const live = useLiveAgent(pubkey);
  const [createOpen, setCreateOpen] = useState(false);

  if (agentQuery.error && !agentQuery.data) {
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
      actions={
        agentQuery.data ? (
          <HeaderActions
            agent={agentQuery.data}
            live={live}
            onCreateVault={() => setCreateOpen(true)}
          />
        ) : null
      }
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
        <Card
          title="Vaults funding this agent"
          meta={vaultsQuery.data ? `${vaultsQuery.data.length} linked` : "—"}
          tools={
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-full bg-mint px-3 py-1 text-[11.5px] font-semibold text-bg hover:bg-mint-soft"
            >
              + New vault
            </button>
          }
        >
          {vaultsQuery.isLoading ? (
            <SkeletonRows rows={2} height={56} />
          ) : vaultsQuery.data && vaultsQuery.data.length > 0 ? (
            <LinkedVaults vaults={vaultsQuery.data} />
          ) : (
            <EmptyState note="No vault is funding this agent yet. Click + New vault to create one." />
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

      {createOpen && pubkey && (
        <CreateVaultForAgentModal agentPubkey={pubkey} onClose={() => setCreateOpen(false)} />
      )}
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
            <span>
              {Number.isFinite(agent.score) && agent.score > 0
                ? String(agent.score).padStart(3, "0")
                : "—"}
            </span>
            <ScoreBadge score={Number.isFinite(agent.score) ? agent.score : 0} />
          </span>
        }
        sub={`Tier: ${tierFor(Number.isFinite(agent.score) ? agent.score : 0).label.toLowerCase()}`}
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

function HeaderActions({
  agent,
  live,
  onCreateVault,
}: {
  agent: Agent;
  live: ReturnType<typeof useLiveAgent>;
  onCreateVault: () => void;
}) {
  const { publicKey } = useWallet();
  return (
    <div className="flex items-center gap-2">
      <LiveBadge status={live.status} />
      <button
        type="button"
        onClick={onCreateVault}
        disabled={!publicKey}
        title={publicKey ? "Create a credit vault that funds this agent" : "Connect a wallet first"}
        className="inline-flex h-8 items-center rounded-md bg-mint px-3 font-semibold text-[11.5px] text-bg hover:bg-mint-soft disabled:cursor-not-allowed disabled:opacity-40"
      >
        + New vault
      </button>
      <Link
        to={`/reputation/${agent.pubkey}`}
        className="inline-flex h-8 items-center rounded-md border border-white/[0.16] bg-surface-2 px-3 font-mono text-[11.5px] text-fg-2 hover:bg-surface-3"
      >
        Public profile ↗
      </Link>
    </div>
  );
}

function LinkedVaults({ vaults }: { vaults: ReadonlyArray<Vault> }) {
  return (
    <div className="grid gap-1.5">
      {vaults.map((vault) => {
        const balance = vaultBalance(vault);
        return (
          <Link
            key={vault.pubkey}
            to={`/console/vaults/${vault.pubkey}`}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-4 rounded-md border border-white/[0.07] bg-surface-2/40 px-3 py-2.5 hover:bg-surface-3/60"
          >
            <div className="grid gap-0.5">
              <span className="font-mono text-[12.5px] text-fg">{shortPubkey(vault.pubkey)}</span>
              <span className="font-mono text-[10.5px] text-muted">
                owner {shortPubkey(vault.owner)} · per-tx {formatUsdc(vault.per_tx_limit_usdc)}
              </span>
            </div>
            <span className="font-mono text-[12.5px] text-fg-2">{formatUsdc(balance)}</span>
            <span
              className={
                "rounded-full px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.06em] " +
                (vault.frozen
                  ? "bg-[#E0857714] text-[#E08577]"
                  : balance > 0
                    ? "bg-white/[0.06] text-mint"
                    : "bg-white/[0.06] text-muted")
              }
            >
              {vault.frozen ? "frozen" : balance > 0 ? "active" : "empty"}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function CreateVaultForAgentModal({
  agentPubkey,
  onClose,
}: {
  agentPubkey: string;
  onClose: () => void;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const qc = useQueryClient();
  const [mint, setMint] = useState(DEFAULT_DEVNET_USDC_MINT);
  const [perTx, setPerTx] = useState("1");
  const [hourly, setHourly] = useState("5");
  const [lifetime, setLifetime] = useState("100");
  const [allowPostPay, setAllowPostPay] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [vaultPubkey, setVaultPubkey] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError("Wallet not connected");
      return;
    }
    const toMicro = (s: string, label: string) => {
      const n = Number(s);
      if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a non-negative number`);
      return Math.round(n * 1_000_000);
    };
    setError(null);
    setStatus("submitting");
    try {
      const { signature: sig, vault } = await createVault({
        connection,
        wallet: { publicKey: wallet.publicKey, signTransaction: wallet.signTransaction },
        agentPubkey: new PublicKey(agentPubkey),
        mint: new PublicKey(mint),
        perTxUsdcMicro: toMicro(perTx, "Per-tx"),
        hourlyUsdcMicro: toMicro(hourly, "Hourly"),
        lifetimeUsdcMicro: toMicro(lifetime, "Lifetime"),
        allowPostPay,
      });
      setSignature(sig);
      setVaultPubkey(vault.toBase58());
      setStatus("done");
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.vaults() }),
        qc.invalidateQueries({ queryKey: queryKeys.agentVaults(agentPubkey) }),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("idle");
    }
  };

  return (
    <Modal title={`Create vault for ${shortPubkey(agentPubkey)}`} onClose={onClose}>
      {status === "done" ? (
        <div className="grid gap-4">
          <p className="m-0 text-[14px] text-fg-2">Vault created.</p>
          <div className="grid gap-1.5">
            <span className="font-mono text-[10.5px] tracking-[0.06em] text-muted uppercase">
              Vault
            </span>
            <Link
              to={`/console/vaults/${vaultPubkey}`}
              className="block truncate font-mono text-[12px] text-mint hover:underline"
              onClick={onClose}
            >
              {vaultPubkey}
            </Link>
          </div>
          {signature ? (
            <a
              href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate font-mono text-[11.5px] text-muted hover:text-fg"
            >
              tx {signature}
            </a>
          ) : null}
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
      ) : (
        <form onSubmit={onSubmit} className="grid gap-4">
          <p className="m-0 rounded-md border border-[var(--color-line)] bg-surface-2 px-3 py-2 text-[11.5px] leading-relaxed text-muted">
            This vault will fund the existing agent{" "}
            <span className="font-mono text-fg-2">{shortPubkey(agentPubkey)}</span>. Your wallet
            (owner) pays rent and controls policy.
          </p>
          <Field label="USDC mint">
            <input
              type="text"
              value={mint}
              onChange={(e) => setMint(e.target.value)}
              spellCheck={false}
              className="w-full rounded-md border border-[var(--color-line-2)] bg-surface px-3 py-2 font-mono text-[12px] text-fg outline-none focus:border-mint-soft"
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Per-tx (USDC)">
              <CapInput value={perTx} onChange={setPerTx} />
            </Field>
            <Field label="Hourly (USDC)">
              <CapInput value={hourly} onChange={setHourly} />
            </Field>
            <Field label="Lifetime (USDC)">
              <CapInput value={lifetime} onChange={setLifetime} />
            </Field>
          </div>
          <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-fg-2">
            <input
              type="checkbox"
              checked={allowPostPay}
              onChange={(e) => setAllowPostPay(e.target.checked)}
              className="h-4 w-4 accent-mint"
            />
            Allow post-pay
            <span className="font-mono text-[10.5px] text-muted">(advanced)</span>
          </label>
          {error && (
            <div className="rounded-md border border-[#E0857733] bg-[#E0857714] px-3 py-2 text-[12px] text-[#E08577]">
              {error}
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[var(--color-line)] px-4 py-2 text-[12.5px] text-fg-2 hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={status === "submitting"}
              className="rounded-full bg-mint px-4 py-2 text-[12.5px] font-semibold text-bg hover:bg-mint-soft disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === "submitting" ? "Submitting…" : "Create vault"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] rounded-[16px] border border-[var(--color-line-2)] bg-surface p-6 shadow-2xl"
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

function CapInput({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  return (
    <input
      type="number"
      min="0"
      step="0.01"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-[var(--color-line-2)] bg-surface px-3 py-2 font-mono text-[13px] text-fg outline-none focus:border-mint-soft"
    />
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

