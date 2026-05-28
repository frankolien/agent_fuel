import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useQueryClient } from "@tanstack/react-query";
import { CodeBlockCompact } from "@/components/CodeBlock/CodeBlock";
import { useServicesQuery, useVaultQuery } from "@/lib/api/hooks";
import { queryKeys } from "@/lib/api/keys";
import {
  formatNumber,
  formatUsdc,
  formatUsdcCompact,
  microUsdcToDollars,
  shortPubkey,
} from "@/lib/format";
import { updatePolicy } from "@/lib/owner-actions";
import type { Service, Vault } from "@/types/api";
import { vaultBalance } from "@/types/api";
import { Card } from "../components/Card";
import { Skeleton } from "../components/Skeleton";
import { Screen } from "./Screen";

const WHITELIST_CAP = 8;

export function VaultPolicy() {
  const { pubkey = "" } = useParams<{ pubkey: string }>();
  const vaultQuery = useVaultQuery(pubkey);
  const servicesQuery = useServicesQuery();

  return (
    <Screen
      eyebrow={
        <>
          <Link to="/console/vaults" className="hover:text-fg">
            Vaults
          </Link>
          <span className="text-muted">/</span>
          <Link to={`/console/vaults/${pubkey}`} className="font-mono hover:text-fg">
            {shortPubkey(pubkey)}
          </Link>
          <span className="text-muted">/</span>
          <span>vault policy</span>
        </>
      }
      title="Edit constraints"
      subtitle="Changes are signed and submitted as a single update_policy instruction."
    >
      {vaultQuery.isLoading || !vaultQuery.data ? (
        <Skeleton className="h-[420px] w-full" />
      ) : (
        <PolicyEditor
          vault={vaultQuery.data}
          services={servicesQuery.data ?? []}
          servicesLoading={servicesQuery.isLoading}
        />
      )}
    </Screen>
  );
}

function PolicyEditor({
  vault,
  services,
  servicesLoading,
}: {
  vault: Vault;
  services: ReadonlyArray<Service>;
  servicesLoading: boolean;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const initial = useMemo(
    () => ({
      perTx: microUsdcToDollars(vault.per_tx_limit_usdc),
      hourly: microUsdcToDollars(vault.hourly_limit_usdc),
      lifetime: microUsdcToDollars(vault.lifetime_limit_usdc),
      allowPostPay: vault.allow_post_pay,
      whitelist: vault.whitelist,
    }),
    [vault],
  );

  const [perTx, setPerTx] = useState(initial.perTx);
  const [hourly, setHourly] = useState(initial.hourly);
  const [lifetime, setLifetime] = useState(initial.lifetime);
  const [allowPostPay, setAllowPostPay] = useState(initial.allowPostPay);
  const [whitelist, setWhitelist] = useState<string[]>(initial.whitelist);
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [error, setError] = useState<string | null>(null);

  const dirty =
    perTx !== initial.perTx ||
    hourly !== initial.hourly ||
    lifetime !== initial.lifetime ||
    allowPostPay !== initial.allowPostPay ||
    !setsEqual(whitelist, initial.whitelist);

  const onReset = () => {
    setPerTx(initial.perTx);
    setHourly(initial.hourly);
    setLifetime(initial.lifetime);
    setAllowPostPay(initial.allowPostPay);
    setWhitelist(initial.whitelist);
    setError(null);
  };

  const toggleService = (pubkey: string) => {
    setWhitelist((prev) =>
      prev.includes(pubkey)
        ? prev.filter((p) => p !== pubkey)
        : prev.length < WHITELIST_CAP
          ? [...prev, pubkey]
          : prev,
    );
  };

  const onSubmit = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError("Wallet not connected");
      return;
    }
    setError(null);
    setStatus("submitting");
    try {
      await updatePolicy({
        connection,
        wallet: { publicKey: wallet.publicKey, signTransaction: wallet.signTransaction },
        owner: new PublicKey(vault.owner),
        agent: new PublicKey(vault.agent),
        perTxUsdcMicro: Math.round(perTx * 1_000_000),
        hourlyUsdcMicro: Math.round(hourly * 1_000_000),
        lifetimeUsdcMicro: Math.round(lifetime * 1_000_000),
        allowPostPay,
        whitelist: whitelist.map((p) => new PublicKey(p)),
      });
      await qc.invalidateQueries({ queryKey: queryKeys.vault(vault.pubkey) });
      navigate(`/console/vaults/${vault.pubkey}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("idle");
    }
  };

  return (
    <div className="grid gap-3.5">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10.5px] tracking-[0.06em] text-muted uppercase">
          spend policy · on-chain
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            disabled={!dirty || status === "submitting"}
            className="inline-flex h-8 items-center rounded-md border border-[var(--color-line)] bg-surface-2 px-3 font-mono text-[11.5px] text-fg-2 hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!dirty || status === "submitting" || !wallet.publicKey}
            className="inline-flex h-8 items-center rounded-md bg-mint px-3 font-semibold text-[11.5px] text-bg hover:bg-mint-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "submitting" ? "Submitting…" : "Sign & submit  · ~0.0005 SOL"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Limits">
          <div className="grid gap-6 py-1">
            <CapSlider
              label="Max per transaction"
              hint="Single x402 payment cap. Smaller = safer."
              value={perTx}
              onChange={setPerTx}
              min={0.01}
              max={250}
              step={0.5}
            />
            <CapSlider
              label="Max per rolling hour"
              hint="Resets every Solana slot-tick hour."
              value={hourly}
              onChange={setHourly}
              min={1}
              max={2500}
              step={5}
            />
            <CapSlider
              label="Lifetime budget ceiling"
              hint="Vault refuses to spend beyond this total."
              value={lifetime}
              onChange={setLifetime}
              min={100}
              max={50_000}
              step={100}
            />

            <div className="flex items-start justify-between gap-4 border-t border-white/[0.06] pt-4">
              <div className="grid gap-1">
                <span className="text-[13.5px] font-medium text-fg">Post-pay credit</span>
                <span className="text-[12px] text-muted">
                  Trusted services can claim usage in batches. Off by default.
                </span>
              </div>
              <Toggle checked={allowPostPay} onChange={setAllowPostPay} />
            </div>
          </div>
        </Card>

        <Card
          title="Preview"
          meta="simulated next-hour envelope"
        >
          <PreviewPanel vault={vault} perTx={perTx} hourly={hourly} lifetime={lifetime} />
          <div className="mt-4 grid gap-1.5">
            <span className="font-mono text-[10.5px] tracking-[0.06em] text-muted uppercase">
              instruction
            </span>
            <CodeBlockCompact lang="ts">
              {renderInstructionPreview({
                vault: vault.pubkey,
                perTx,
                hourly,
                lifetime,
                allowPostPay,
                whitelist,
              })}
            </CodeBlockCompact>
          </div>
        </Card>
      </div>

      <Card
        title="Service whitelist"
        meta={`${whitelist.length} / ${WHITELIST_CAP}`}
      >
        <WhitelistGrid
          services={services}
          selected={whitelist}
          onToggle={toggleService}
          cap={WHITELIST_CAP}
          loading={servicesLoading}
        />
      </Card>

      {error ? (
        <div className="rounded-md border border-[#E0857733] bg-[#E0857714] px-3 py-2 text-[12.5px] text-[#E08577]">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function CapSlider({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[13.5px] font-medium text-fg">{label}</span>
        <span className="font-mono text-[16px] text-fg">${formatNumber(Math.round(value))}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-surface-2 accent-mint"
      />
      <div className="flex items-baseline justify-between text-[10.5px]">
        <span className="font-mono text-muted">${formatNumber(min)}</span>
        <span className="text-muted">{hint}</span>
        <span className="font-mono text-muted">${formatNumber(max)}</span>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
        checked ? "bg-mint" : "bg-surface-2 border border-[var(--color-line-2)]"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-bg shadow-md transition ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function PreviewPanel({
  vault,
  perTx,
  hourly,
  lifetime,
}: {
  vault: Vault;
  perTx: number;
  hourly: number;
  lifetime: number;
}) {
  const balance = vaultBalance(vault);
  const balanceUsd = microUsdcToDollars(balance);
  const spentUsd = microUsdcToDollars(vault.total_spent);
  const hourSpentUsd = 0; // backend doesn't expose hourly spend yet
  const hourlyHeadroom = Math.max(0, hourly - hourSpentUsd);
  const lifetimeRemaining = Math.max(0, lifetime - spentUsd);

  const fraction = hourly > 0 ? hourSpentUsd / hourly : 0;
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-[1fr_auto] items-baseline gap-3">
        <span className="text-[12px] text-muted">Current hour</span>
        <span className="font-mono text-[12px] text-fg">
          ${formatNumber(hourSpentUsd)} / ${formatNumber(hourly)}
        </span>
      </div>
      <EnvelopeBar fraction={fraction} />
      <PreviewRow label="Largest single tx allowed" value={`$${formatNumber(perTx)}`} />
      <PreviewRow label="Headroom this hour" value={`$${formatNumber(hourlyHeadroom)}`} />
      <PreviewRow
        label="Vault remaining after ceiling"
        value={
          balanceUsd > lifetimeRemaining
            ? `$${formatNumber(Math.round(lifetimeRemaining))}`
            : formatUsdc(balance)
        }
      />
    </div>
  );
}

function EnvelopeBar({ fraction }: { fraction: number }) {
  // 40 cells; fill proportional to fraction. Pure aesthetic — matches the mock.
  const CELLS = 40;
  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * CELLS);
  return (
    <div className="flex gap-[3px]">
      {Array.from({ length: CELLS }).map((_, i) => (
        <span
          key={i}
          className={`h-2.5 flex-1 rounded-[1px] ${i < filled ? "bg-mint" : "bg-surface-2"}`}
        />
      ))}
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[12px] text-muted">{label}</span>
      <span className="font-mono text-[12.5px] text-fg">{value}</span>
    </div>
  );
}

function WhitelistGrid({
  services,
  selected,
  onToggle,
  cap,
  loading,
}: {
  services: ReadonlyArray<Service>;
  selected: string[];
  onToggle: (pubkey: string) => void;
  cap: number;
  loading: boolean;
}) {
  // Distinguish "still fetching" (skeleton) from "fetched, none found"
  // (CTA pointing at the Services screen). Previously both rendered the
  // same "No services registered yet" copy, so the screen looked permanently
  // empty for the half-second the query was in flight.
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[58px] animate-pulse rounded-md border border-[var(--color-line)] bg-surface-2/60"
          />
        ))}
      </div>
    );
  }
  if (services.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-white/[0.09] bg-surface/40 px-4 py-8 text-center text-[12.5px] text-muted">
        No services registered yet. Add one from the Services screen, then come back to whitelist it.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-4">
      {services.map((svc) => {
        const isSelected = selected.includes(svc.pubkey);
        const disabled = !isSelected && selected.length >= cap;
        return (
          <label
            key={svc.pubkey}
            className={`flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2.5 transition ${
              isSelected
                ? "border-mint/60 bg-mint/[0.08]"
                : disabled
                  ? "cursor-not-allowed border-[var(--color-line)] bg-surface/40 opacity-50"
                  : "border-[var(--color-line)] bg-surface-2 hover:bg-surface-3"
            }`}
          >
            <div className="grid min-w-0 gap-0.5">
              <span className="truncate text-[12.5px] text-fg">{svc.name || "unnamed"}</span>
              <span className="truncate font-mono text-[10.5px] text-muted">
                {svc.category.toLowerCase()} · {shortPubkey(svc.pubkey)}
              </span>
            </div>
            <input
              type="checkbox"
              checked={isSelected}
              disabled={disabled}
              onChange={() => onToggle(svc.pubkey)}
              className="h-4 w-4 accent-mint"
            />
          </label>
        );
      })}
    </div>
  );
}

function renderInstructionPreview({
  vault,
  perTx,
  hourly,
  lifetime,
  allowPostPay,
  whitelist,
}: {
  vault: string;
  perTx: number;
  hourly: number;
  lifetime: number;
  allowPostPay: boolean;
  whitelist: string[];
}): string {
  const w = whitelist.length === 0
    ? "[]"
    : `[${whitelist.length} pubkeys]`;
  return `update_policy(
  vault:           "${shortPubkey(vault)}",
  max_per_tx:      ${perTx.toFixed(2)} USDC,
  max_per_hour:    ${hourly.toFixed(2)} USDC,
  budget_ceiling:  ${formatUsdcCompact(lifetime * 1_000_000)},
  allow_post_pay:  ${allowPostPay},
  whitelist:       ${w},
)`;
}

function setsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const x of b) if (!sa.has(x)) return false;
  return true;
}
