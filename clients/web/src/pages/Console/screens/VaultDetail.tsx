import { Link, useParams } from "react-router-dom";
import { useVaultActivityQuery, useVaultQuery } from "@/lib/api/hooks";
import { useLiveAgent } from "@/lib/api/useLiveAgent";
import { formatDate, formatUsdc, formatUsdcCompact, shortPubkey } from "@/lib/format";
import type { Vault } from "@/types/api";
import { Screen } from "./Screen";
import { ActivityRow } from "../components/ActivityRow";
import { AddressPill } from "../components/AddressPill";
import { Card } from "../components/Card";
import { Gauge } from "../components/Gauge";
import { LiveBadge } from "../components/LiveBadge";
import { Kpi, KpiStrip } from "../components/Kpi";
import { PolicyChip } from "../components/PolicyChip";
import { Skeleton, SkeletonRows } from "../components/Skeleton";

export function VaultDetail() {
  const { pubkey = "" } = useParams<{ pubkey: string }>();
  const vaultQuery = useVaultQuery(pubkey);
  const activityQuery = useVaultActivityQuery(pubkey);
  const live = useLiveAgent(vaultQuery.data?.agent);

  if (vaultQuery.error) {
    return (
      <Screen title="Vault not found" subtitle="That pubkey isn't in your treasury.">
        <Link to="/console/vaults" className="text-mint hover:text-fg">
          ← Back to vaults
        </Link>
      </Screen>
    );
  }

  return (
    <Screen
      eyebrow={
        <>
          <Link to="/console/vaults" className="hover:text-fg">
            Vaults
          </Link>
          <span className="text-muted">/</span>
          <span className="font-mono">{shortPubkey(pubkey)}</span>
        </>
      }
      title={vaultQuery.data ? `Vault ${shortPubkey(vaultQuery.data.pubkey)}` : "Vault"}
      subtitle={
        vaultQuery.data ? (
          <>
            Agent{" "}
            <Link
              to={`/console/agents/${vaultQuery.data.agent}`}
              className="font-mono text-mint-soft hover:text-mint"
            >
              {shortPubkey(vaultQuery.data.agent)}
            </Link>{" "}
            · Owner {shortPubkey(vaultQuery.data.owner)}
          </>
        ) : (
          "Loading…"
        )
      }
      actions={vaultQuery.data ? <HeaderBadges vault={vaultQuery.data} live={live} /> : null}
    >
      {vaultQuery.isLoading ? <HeroSkeleton /> : null}
      {vaultQuery.data ? <VaultKpis vault={vaultQuery.data} /> : null}

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Budget envelope" meta={vaultQuery.data ? "alerts at 70 / 80 / 90%" : "—"}>
          {vaultQuery.data ? (
            <BudgetEnvelope vault={vaultQuery.data} />
          ) : (
            <Skeleton className="h-[120px] w-full" />
          )}
        </Card>

        <Card title="Hourly window" meta={vaultQuery.data ? "resets at the top of the hour" : "—"}>
          {vaultQuery.data ? (
            <HourlyWindow vault={vaultQuery.data} />
          ) : (
            <Skeleton className="h-[120px] w-full" />
          )}
        </Card>
      </div>

      <div className="mt-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Policy">
          {vaultQuery.data ? (
            <PolicyGrid vault={vaultQuery.data} />
          ) : (
            <Skeleton className="h-[140px] w-full" />
          )}
        </Card>

        <Card title="Whitelist" meta={vaultQuery.data ? `${vaultQuery.data.policy.whitelist.length} / 16` : "—"}>
          {vaultQuery.data ? <Whitelist vault={vaultQuery.data} /> : <Skeleton className="h-[140px] w-full" />}
        </Card>
      </div>

      <div className="mt-3.5">
        <Card
          title="Activity"
          meta={activityQuery.data ? `${activityQuery.data.items.length} recent` : "—"}
        >
          {activityQuery.isLoading ? (
            <SkeletonRows rows={6} height={36} />
          ) : activityQuery.data && activityQuery.data.items.length > 0 ? (
            <div>
              {activityQuery.data.items.map((event) => (
                <ActivityRow
                  key={`${event.signature}:${event.log_index}`}
                  event={event}
                  referenceSlot={activityQuery.data!.items[0]!.slot}
                />
              ))}
            </div>
          ) : (
            <EmptyState note="No events for this vault yet." />
          )}
        </Card>
      </div>
    </Screen>
  );
}

function VaultKpis({ vault }: { vault: Vault }) {
  const limit = vault.policy.lifetime_limit_usdc;
  const remainingMicro = Math.max(0, limit - vault.total_spent);
  const remainingDollars = formatUsdcCompact(remainingMicro);
  const hourlyRemaining = Math.max(0, vault.policy.per_hour_limit_usdc - vault.hourly_used_usdc);
  return (
    <KpiStrip>
      <Kpi
        hero
        label="USDC balance"
        value={formatUsdcCompact(vault.balance_usdc)}
        sub={`${formatUsdc(vault.balance_usdc)} on-chain`}
      />
      <Kpi
        label="Spent (lifetime)"
        value={formatUsdcCompact(vault.total_spent)}
        sub={limit > 0 ? `of ${formatUsdcCompact(limit)} ceiling` : "no ceiling"}
      />
      <Kpi
        label="Budget remaining"
        value={limit > 0 ? remainingDollars : "—"}
        sub={limit > 0 ? `${Math.round((1 - vault.total_spent / limit) * 100)}% headroom` : "uncapped"}
      />
      <Kpi
        label="Hour remaining"
        value={formatUsdcCompact(hourlyRemaining)}
        sub={`${formatUsdc(vault.hourly_used_usdc)} used this hour`}
      />
    </KpiStrip>
  );
}

function BudgetEnvelope({ vault }: { vault: Vault }) {
  const limit = vault.policy.lifetime_limit_usdc;
  const fraction = limit > 0 ? vault.total_spent / limit : 0;
  const pct = Math.round(fraction * 100);
  const tone: "mint" | "warn" | "danger" = pct >= 90 ? "danger" : pct >= 70 ? "warn" : "mint";
  return (
    <div className="grid gap-3">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="font-mono text-[26px] font-medium text-fg [text-shadow:0_0_24px_rgba(166,225,207,0.25)]">
            {formatUsdcCompact(vault.total_spent)}
          </div>
          <div className="font-mono text-[11.5px] text-muted">
            of {limit > 0 ? formatUsdcCompact(limit) : "∞"} spent lifetime
          </div>
        </div>
        <div className="text-right">
          <div className={`font-mono text-[14px] ${tone === "danger" ? "text-[#E08577]" : tone === "warn" ? "text-[#E6B86F]" : "text-mint"}`}>
            {pct}%
          </div>
          {vault.last_budget_alert_pct > 0 ? (
            <div className="font-mono text-[11px] text-muted">last alert at {vault.last_budget_alert_pct}%</div>
          ) : null}
        </div>
      </div>
      <Gauge fraction={fraction} thresholds={[0.7, 0.8, 0.9]} tone={tone} height={10} />
      <div className="flex justify-between font-mono text-[10.5px] text-muted">
        <span>0%</span>
        <span>70</span>
        <span>80</span>
        <span>90</span>
        <span>100%</span>
      </div>
    </div>
  );
}

function HourlyWindow({ vault }: { vault: Vault }) {
  const limit = vault.policy.per_hour_limit_usdc;
  const fraction = limit > 0 ? vault.hourly_used_usdc / limit : 0;
  const pct = Math.round(fraction * 100);
  const tone: "mint" | "warn" | "danger" = pct >= 90 ? "danger" : pct >= 70 ? "warn" : "mint";
  return (
    <div className="grid gap-3">
      <div>
        <div className="font-mono text-[26px] font-medium text-fg">
          {formatUsdcCompact(vault.hourly_used_usdc)}
        </div>
        <div className="font-mono text-[11.5px] text-muted">
          of {limit > 0 ? formatUsdcCompact(limit) : "∞"} per hour
        </div>
      </div>
      <Gauge fraction={fraction} tone={tone} height={10} />
      <div className="font-mono text-[11px] text-muted">
        {limit > 0
          ? `${formatUsdcCompact(Math.max(0, limit - vault.hourly_used_usdc))} headroom before throttle`
          : "uncapped"}
      </div>
    </div>
  );
}

function PolicyGrid({ vault }: { vault: Vault }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
      <PolicyChip label="Per tx" value={formatUsdc(vault.policy.per_tx_limit_usdc)} />
      <PolicyChip
        label="Per hour"
        value={formatUsdc(vault.policy.per_hour_limit_usdc)}
        sub={`${formatUsdc(vault.hourly_used_usdc)} used`}
      />
      <PolicyChip
        label="Lifetime"
        value={vault.policy.lifetime_limit_usdc > 0 ? formatUsdcCompact(vault.policy.lifetime_limit_usdc) : "uncapped"}
      />
      <PolicyChip
        label="Post-pay"
        value={vault.policy.allow_post_pay ? "Enabled" : "Disabled"}
      />
      <PolicyChip label="Frozen" value={vault.frozen ? "Yes" : "No"} />
      <PolicyChip label="Updated" value={formatDate(vault.updated_at)} />
    </div>
  );
}

function Whitelist({ vault }: { vault: Vault }) {
  if (vault.policy.whitelist.length === 0) {
    return <EmptyState note="No services whitelisted. Add up to 16 from the SDK." />;
  }
  return (
    <div className="grid gap-2">
      {vault.policy.whitelist.map((addr) => (
        <AddressPill key={addr} address={addr} />
      ))}
    </div>
  );
}

function HeaderBadges({ vault, live }: { vault: Vault; live: ReturnType<typeof useLiveAgent> }) {
  return (
    <div className="flex items-center gap-2">
      <LiveBadge status={live.status} />
      {vault.frozen ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E0857714] px-3 py-1 font-mono text-[11.5px] tracking-[0.06em] text-[#E08577] uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-[#E08577]" />
          Frozen
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-3 py-1 font-mono text-[11.5px] tracking-[0.06em] text-mint uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-mint" />
          Active
        </span>
      )}
      <AddressPill label="vault" address={vault.pubkey} />
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

function EmptyState({ note }: { note: string }) {
  return (
    <div className="rounded-md border border-dashed border-white/[0.09] bg-surface/40 px-4 py-8 text-center text-[12.5px] text-muted">
      {note}
    </div>
  );
}
