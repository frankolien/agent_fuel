import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useVaultsQuery } from "@/lib/api/hooks";
import {
  formatUsdc,
  formatUsdcCompact,
  microUsdcToDollars,
  shortPubkey,
} from "@/lib/format";
import type { Vault } from "@/types/api";
import { Screen } from "./Screen";
import { Gauge } from "../components/Gauge";
import { SkeletonRows } from "../components/Skeleton";

export function Vaults() {
  const { data, isLoading, error } = useVaultsQuery();

  return (
    <Screen
      eyebrow="Treasury"
      title="Vaults"
      subtitle="USDC-funded credit vaults and policies."
      actions={
        data ? (
          <span className="font-mono text-[11.5px] tracking-[0.06em] text-muted uppercase">
            {data.length} total
          </span>
        ) : null
      }
    >
      {isLoading ? <SkeletonRows rows={6} height={68} /> : null}
      {error ? <ErrorState message={(error as Error).message} /> : null}
      {data ? <VaultsTable vaults={data} /> : null}
    </Screen>
  );
}

function VaultsTable({ vaults }: { vaults: ReadonlyArray<Vault> }) {
  if (vaults.length === 0) {
    return (
      <div className="grid place-items-center rounded-[10px] border border-dashed border-white/[0.09] bg-surface/40 px-6 py-20 text-center text-[13px] text-muted">
        No vaults yet. Create one with the SDK to fund an agent.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[10px] border border-white/[0.09] bg-[#0e0f11]">
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left">
            <Th>Vault</Th>
            <Th>Agent</Th>
            <Th align="right">Balance</Th>
            <Th>Budget</Th>
            <Th align="right">Per tx</Th>
            <Th align="right">Per hr</Th>
            <Th align="right">Status</Th>
          </tr>
        </thead>
        <tbody>
          {vaults.map((vault) => (
            <VaultRow key={vault.pubkey} vault={vault} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VaultRow({ vault }: { vault: Vault }) {
  const limit = vault.policy.lifetime_limit_usdc;
  const fraction = limit > 0 ? vault.total_spent / limit : 0;
  const pct = Math.round(fraction * 100);
  const tone: "mint" | "warn" | "danger" = pct >= 90 ? "danger" : pct >= 70 ? "warn" : "mint";

  return (
    <tr className="border-t border-white/[0.05] hover:bg-white/[0.02]">
      <Td>
        <Link to={`/console/vaults/${vault.pubkey}`} className="grid gap-0.5 hover:text-fg">
          <span className="font-mono text-[13px] text-fg">{shortPubkey(vault.pubkey)}</span>
          <span className="font-mono text-[11px] text-muted">owner {shortPubkey(vault.owner)}</span>
        </Link>
      </Td>
      <Td>
        <Link
          to={`/console/agents/${vault.agent}`}
          className="font-mono text-[12.5px] text-mint-soft hover:text-mint"
        >
          {shortPubkey(vault.agent)}
        </Link>
      </Td>
      <Td align="right">
        <span className="font-mono text-[13px]">{formatUsdc(vault.balance_usdc)}</span>
      </Td>
      <Td>
        <div className="grid min-w-[180px] gap-1">
          <Gauge fraction={fraction} thresholds={[0.7, 0.8, 0.9]} tone={tone} />
          <span className="font-mono text-[10.5px] text-muted">
            {limit > 0
              ? `${pct}% of ${formatUsdcCompact(limit)}`
              : "uncapped"}
          </span>
        </div>
      </Td>
      <Td align="right">
        <span className="font-mono text-[12.5px] text-fg-2">{formatUsdc(vault.policy.per_tx_limit_usdc)}</span>
      </Td>
      <Td align="right">
        <div className="grid justify-items-end gap-0.5">
          <span className="font-mono text-[12.5px] text-fg-2">{formatUsdc(vault.policy.per_hour_limit_usdc)}</span>
          <span className="font-mono text-[10.5px] text-muted">
            {formatUsdc(vault.hourly_used_usdc)} used
          </span>
        </div>
      </Td>
      <Td align="right">
        <StatusBadge vault={vault} />
      </Td>
    </tr>
  );
}

function StatusBadge({ vault }: { vault: Vault }) {
  if (vault.frozen) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E0857714] px-2 py-0.5 font-mono text-[10.5px] tracking-[0.06em] text-[#E08577] uppercase">
        <span className="h-1.5 w-1.5 rounded-full bg-[#E08577]" />
        Frozen
      </span>
    );
  }
  if (vault.last_budget_alert_pct >= 90) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E0857714] px-2 py-0.5 font-mono text-[10.5px] tracking-[0.06em] text-[#E08577] uppercase">
        {vault.last_budget_alert_pct}% spent
      </span>
    );
  }
  if (vault.last_budget_alert_pct >= 70) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E6B86F14] px-2 py-0.5 font-mono text-[10.5px] tracking-[0.06em] text-[#E6B86F] uppercase">
        {vault.last_budget_alert_pct}% spent
      </span>
    );
  }
  const dollars = microUsdcToDollars(vault.balance_usdc);
  if (dollars > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2 py-0.5 font-mono text-[10.5px] tracking-[0.06em] text-mint uppercase">
        <span className="h-1.5 w-1.5 rounded-full bg-mint" />
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2 py-0.5 font-mono text-[10.5px] tracking-[0.06em] text-muted uppercase">
      Empty
    </span>
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
      Couldn't load vaults — <span className="font-mono">{message}</span>
    </div>
  );
}
