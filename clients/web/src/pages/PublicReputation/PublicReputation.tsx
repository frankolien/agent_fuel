import { Link, useParams } from "react-router-dom";
import { Brand } from "@/components/Brand/Brand";
import { useReputationQuery } from "@/lib/api/hooks";
import { formatNumber, formatNumberCompact, formatUsdcCompact, shortPubkey } from "@/lib/format";
import type { ReputationLookup } from "@/types/api";
import { tierFor } from "@/pages/Console/components/ScoreBadge";

export function PublicReputation() {
  const { agent = "" } = useParams<{ agent: string }>();
  const { data, isLoading, error } = useReputationQuery(agent);

  return (
    <main className="animate-page-in relative min-h-screen overflow-hidden bg-bg text-fg">
      <div className="bg-fx" aria-hidden="true" />

      <header className="relative z-10 mx-auto flex max-w-[var(--container-shell)] items-center justify-between px-[var(--pad)] py-6">
        <Brand />
        <nav className="flex items-center gap-5 font-mono text-[12px] text-muted">
          <a href="/" className="hover:text-fg">
            What is Agent Fuel?
          </a>
          <a href="/#sdk" className="hover:text-fg">
            For services
          </a>
        </nav>
      </header>

      <section className="relative z-10 mx-auto max-w-[var(--container-shell)] px-[var(--pad)] py-12 md:py-20">
        {isLoading ? <LoadingState /> : null}
        {error ? <ErrorState agent={agent} /> : null}
        {data ? <Profile agent={agent} data={data} /> : null}
      </section>

      <footer className="relative z-10 mx-auto max-w-[var(--container-shell)] border-t border-white/[0.06] px-[var(--pad)] py-6 font-mono text-[11px] text-muted">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>
            Public profile · live data ·{" "}
            {data ? <>updated {new Date(data.updated_at).toLocaleString()}</> : "—"}
          </span>
          <Link to="/" className="hover:text-fg">
            ← Agent Fuel
          </Link>
        </div>
      </footer>
    </main>
  );
}

function Profile({ agent, data }: { agent: string; data: ReputationLookup }) {
  const { label, tone } = tierFor(data.score);

  return (
    <div className="grid gap-10 lg:grid-cols-[460px_1fr] lg:gap-16">
      <div className="grid place-items-center">
        <ScoreDial score={data.score} />
      </div>

      <div className="grid gap-8">
        <div>
          <div className="font-mono text-[11.5px] tracking-[0.18em] text-mint-soft uppercase">
            Agent reputation · live
          </div>
          <h1 className="m-0 mt-2 text-[44px] leading-[1.05] font-medium tracking-[-0.03em]">
            <span className={tone}>{label}</span>
          </h1>
          <p className="mt-3 text-[15px] text-muted">
            <span className="font-mono text-fg-2">{shortPubkey(agent, 6)}</span> ·{" "}
            <Interpretation score={data.score} />
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Metric label="Transactions" value={formatNumberCompact(data.total_transactions)} sub={`${formatNumber(data.total_transactions)} lifetime`} />
          <Metric label="Volume" value={formatUsdcCompact(data.total_volume_usdc)} sub="USDC paid" />
          <Metric label="Services" value={formatNumber(data.services_used)} sub="unique counterparties" />
          <Metric label="Streak" value={formatNumberCompact(data.consecutive_success)} sub="consecutive successes" />
          <Metric
            label="Feedback"
            value={formatNumber(data.total_feedback_count)}
            sub={`${data.active_negative_feedback_count} active negative`}
          />
          <Metric
            label="Last active"
            value={data.last_active_slot !== null ? `slot ${formatNumberCompact(data.last_active_slot)}` : "—"}
            sub="updated continuously"
          />
        </div>

        <ForServicesPanel score={data.score} />
      </div>
    </div>
  );
}

function ScoreDial({ score }: { score: number | null }) {
  // Half-circle gauge: 0 at bottom-left, 1000 at bottom-right, sweeping over the top.
  // Path is a 180° arc from (32, 158) to (188, 158) with radius 90 — same
  // geometry as the hero viz on the landing page, so the brand feel matches.
  const fraction = score === null ? 0 : Math.max(0, Math.min(1, score / 1000));
  const arcLength = 360; // approximate length of the 180° arc at r=90, for stroke-dasharray
  const filled = arcLength * fraction;
  const { tone } = tierFor(score);

  return (
    <div className="relative aspect-square w-full max-w-[420px]">
      <div className="viz-halo pointer-events-none absolute -inset-[8%]" />
      <svg viewBox="0 0 220 220" className="relative block w-full">
        <path
          d="M 32 158 A 90 90 0 1 1 188 158"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M 32 158 A 90 90 0 1 1 188 158"
          stroke="var(--color-mint)"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${arcLength}`}
          style={{ filter: "drop-shadow(0 0 14px var(--color-mint-glow))" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pb-[12%] text-center">
        <div className="font-mono text-[11px] tracking-[0.22em] text-muted">REPUTATION</div>
        <div className={`font-mono text-[clamp(80px,12vw,128px)] leading-none font-medium tracking-[-0.04em] [text-shadow:0_0_28px_var(--color-mint-glow),0_0_80px_var(--color-mint-glow-2)] ${score === null ? "text-muted" : "text-mint"}`}>
          {score === null ? "—" : String(score).padStart(3, "0")}
        </div>
        <div className={`font-mono text-[11px] tracking-[0.22em] uppercase ${tone}`}>
          / 1000
        </div>
      </div>
    </div>
  );
}

function Interpretation({ score }: { score: number | null }) {
  if (score === null) return <>this agent has no on-chain reputation yet.</>;
  if (score >= 900)
    return <>top-tier track record — extend post-pay with confidence.</>;
  if (score >= 750) return <>trusted operator — post-pay is reasonable for typical risk.</>;
  if (score >= 500) return <>standing borrower — pre-payment recommended for new counterparties.</>;
  if (score >= 250) return <>watchlist — require pre-payment.</>;
  return <>at risk — decline credit; require pre-payment with margin.</>;
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[10px] border border-white/[0.08] bg-surface/60 p-4 backdrop-blur-sm">
      <div className="font-mono text-[10.5px] tracking-[0.16em] text-muted uppercase">{label}</div>
      <div className="mt-1.5 font-mono text-[24px] font-medium tracking-[-0.02em]">{value}</div>
      <div className="mt-1 font-mono text-[11px] text-muted">{sub}</div>
    </div>
  );
}

function ForServicesPanel({ score }: { score: number | null }) {
  return (
    <div className="rounded-[14px] border border-white/[0.08] bg-[radial-gradient(120%_60%_at_50%_0%,rgba(166,225,207,0.05),transparent_60%)] p-5">
      <div className="font-mono text-[11px] tracking-[0.16em] text-mint-soft uppercase">
        For services
      </div>
      <p className="m-0 mt-2 text-[14px] text-fg-2">
        Use this signal to decide whether to extend post-pay credit before serving a paid request.
        Score is recomputed every minute from the on-chain history; the headline number above is the
        latest cached value.
      </p>
      <div className="mt-4 flex flex-wrap gap-2 font-mono text-[11.5px]">
        <code className="rounded-md border border-white/[0.08] bg-surface-2 px-2.5 py-1 text-fg-2">
          GET /reputation/&lt;agent&gt;
        </code>
        <code className="rounded-md border border-white/[0.08] bg-surface-2 px-2.5 py-1 text-fg-2">
          af.getScore(agent)
        </code>
        {score !== null ? (
          <code className="rounded-md border border-white/[0.08] bg-surface-2 px-2.5 py-1 text-fg-2">
            score &gt;= 800 → post-pay
          </code>
        ) : null}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid place-items-center py-24">
      <div className="font-mono text-[12px] text-muted">Loading agent reputation…</div>
    </div>
  );
}

function ErrorState({ agent }: { agent: string }) {
  return (
    <div className="mx-auto max-w-[560px] rounded-[14px] border border-[#E0857733] bg-[#E0857714] p-8 text-center">
      <div className="font-mono text-[11px] tracking-[0.18em] text-[#E08577] uppercase">
        Not found
      </div>
      <h1 className="mt-2 text-[28px] font-medium tracking-[-0.02em]">
        No agent at <span className="font-mono">{shortPubkey(agent, 6)}</span>
      </h1>
      <p className="mt-2 text-muted">
        That pubkey hasn't been initialized on Agent Fuel yet. Double-check the address, or have
        the operator run <span className="font-mono text-fg-2">initialize_agent</span>.
      </p>
      <div className="mt-5">
        <Link to="/" className="text-mint hover:text-fg">
          ← Back to Agent Fuel
        </Link>
      </div>
    </div>
  );
}
