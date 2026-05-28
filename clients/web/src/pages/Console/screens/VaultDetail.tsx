import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useQueryClient } from "@tanstack/react-query";
import { useBackfillVault, useVaultActivityQuery, useVaultQuery } from "@/lib/api/hooks";
import { queryKeys } from "@/lib/api/keys";
import { useLiveVault } from "@/lib/api/useLiveVault";
import { toast } from "@/lib/toast";
import { deposit, isMintAuthority, mintTestUsdc, setFrozen } from "@/lib/owner-actions";
import { formatUsdc as formatUsdcWallet, useWalletBalances } from "@/lib/useWalletBalances";
import {
  formatDate,
  formatNumberCompact,
  formatUsdc,
  formatUsdcCompact,
  shortPubkey,
} from "@/lib/format";
import { vaultBalance, type Vault } from "@/types/api";
import { Screen } from "./Screen";
import { ActivityRow } from "../components/ActivityRow";
import { AddressPill } from "../components/AddressPill";
import { Card } from "../components/Card";
import { Gauge } from "../components/Gauge";
import { Kpi, KpiStrip } from "../components/Kpi";
import { LiveBadge } from "../components/LiveBadge";
import { PolicyChip } from "../components/PolicyChip";
import { Skeleton, SkeletonRows } from "../components/Skeleton";

export function VaultDetail() {
  const { pubkey = "" } = useParams<{ pubkey: string }>();
  const vaultQuery = useVaultQuery(pubkey);
  const activityQuery = useVaultActivityQuery(pubkey);
  // /ws/vaults/:pk — receives every event whose payload mentions this vault,
  // including Deposited/Claimed/Frozen/PolicyUpdated which never carried an
  // `agent` field and were silently dropped by /ws/agents/:pk.
  const live = useLiveVault(pubkey);

  // Only show the not-found panel when we've truly never resolved the vault.
  // If we have cached data and the refetch later errors, prefer the stale data
  // (TanStack keeps it for 5 min) over wiping the UI.
  if (vaultQuery.error && !vaultQuery.data) {
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
        <Card
          title="Budget envelope"
          meta={
            vaultQuery.data
              ? vaultQuery.data.lifetime_limit_usdc > 0
                ? "alerts at 70 / 80 / 90%"
                : "uncapped — no alerts"
              : "—"
          }
        >
          {vaultQuery.data ? (
            <BudgetEnvelope vault={vaultQuery.data} />
          ) : (
            <Skeleton className="h-[120px] w-full" />
          )}
        </Card>

        <Card title="Per-hour ceiling" meta={vaultQuery.data ? "from on-chain policy" : "—"}>
          {vaultQuery.data ? (
            <HourlyCeiling vault={vaultQuery.data} />
          ) : (
            <Skeleton className="h-[120px] w-full" />
          )}
        </Card>
      </div>

      <div className="mt-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Policy" tools={vaultQuery.data ? <OwnerActions vault={vaultQuery.data} /> : null}>
          {vaultQuery.data ? (
            <PolicyGrid vault={vaultQuery.data} />
          ) : (
            <Skeleton className="h-[140px] w-full" />
          )}
        </Card>

        <Card title="Identifiers">
          {vaultQuery.data ? <Identifiers vault={vaultQuery.data} /> : <Skeleton className="h-[140px] w-full" />}
        </Card>
      </div>

      <div className="mt-3.5">
        <Card
          title="Activity"
          meta={activityQuery.data ? `${activityQuery.data.length} recent` : "—"}
        >
          {activityQuery.isLoading ? (
            <SkeletonRows rows={6} height={36} />
          ) : activityQuery.data && activityQuery.data.length > 0 ? (
            <div>
              {activityQuery.data.map((event) => (
                <ActivityRow
                  key={`${event.signature}:${event.log_index}`}
                  event={event}
                  referenceSlot={activityQuery.data![0]!.slot}
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
  const limit = vault.lifetime_limit_usdc;
  const balance = vaultBalance(vault);
  const remainingMicro = Math.max(0, limit - vault.total_spent);
  return (
    <KpiStrip>
      <Kpi
        hero
        label="USDC balance"
        value={formatUsdcCompact(balance)}
        sub={`${formatUsdc(balance)} available`}
      />
      <Kpi
        label="Spent (lifetime)"
        value={formatUsdcCompact(vault.total_spent)}
        sub={limit > 0 ? `of ${formatUsdcCompact(limit)} ceiling` : "no ceiling"}
      />
      <Kpi
        label="Budget remaining"
        value={limit > 0 ? formatUsdcCompact(remainingMicro) : "—"}
        sub={limit > 0 ? `${Math.round((1 - vault.total_spent / limit) * 100)}% headroom` : "uncapped"}
      />
      <Kpi
        label="Deposited (lifetime)"
        value={formatUsdcCompact(vault.total_deposited)}
        sub={`${formatUsdc(vault.total_withdrawn)} withdrawn`}
      />
    </KpiStrip>
  );
}

function BudgetEnvelope({ vault }: { vault: Vault }) {
  const limit = vault.lifetime_limit_usdc;
  const uncapped = limit <= 0;
  const fraction = uncapped ? 0 : vault.total_spent / limit;
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
            of {uncapped ? "∞" : formatUsdcCompact(limit)} spent lifetime
          </div>
        </div>
        {/* When the vault is uncapped, the "0%" reading is misleading because
            there's no ceiling to be a percentage of. Show "—" to make the
            absence intentional rather than a stuck-at-zero bug. */}
        <div
          className={`font-mono text-[14px] ${
            uncapped
              ? "text-muted"
              : tone === "danger"
                ? "text-[#E08577]"
                : tone === "warn"
                  ? "text-[#E6B86F]"
                  : "text-mint"
          }`}
        >
          {uncapped ? "—" : `${pct}%`}
        </div>
      </div>
      {/* No threshold ticks on an uncapped vault — 70/80/90 of ∞ is nonsense.
          The bar still renders (empty) so the layout doesn't jump. */}
      <Gauge
        fraction={fraction}
        thresholds={uncapped ? [] : [0.7, 0.8, 0.9]}
        tone={tone}
        height={10}
      />
      {uncapped ? (
        <div className="font-mono text-[10.5px] text-muted">
          No lifetime cap set. Edit the policy to add one so alerts at 70 / 80 / 90 % become meaningful.
        </div>
      ) : (
        <div className="flex justify-between font-mono text-[10.5px] text-muted">
          <span>0%</span>
          <span>70</span>
          <span>80</span>
          <span>90</span>
          <span>100%</span>
        </div>
      )}
    </div>
  );
}

function HourlyCeiling({ vault }: { vault: Vault }) {
  const perHour = vault.hourly_limit_usdc;
  return (
    <div className="grid gap-3">
      <div>
        <div className="font-mono text-[26px] font-medium text-fg">
          {perHour > 0 ? formatUsdcCompact(perHour) : "∞"}
        </div>
        <div className="font-mono text-[11.5px] text-muted">max USDC per rolling hour</div>
      </div>
      <div className="font-mono text-[11px] text-muted">
        Per-tx cap: {formatUsdc(vault.per_tx_limit_usdc)} · Post-pay:{" "}
        {vault.allow_post_pay ? "enabled" : "disabled"}
      </div>
      <div className="font-mono text-[11px] text-muted">
        Real-time hourly usage isn't surfaced via REST yet — it lives in the on-chain `SpendPolicy`
        account. The SDK's `getPolicy()` (Phase 4.S) will expose it.
      </div>
    </div>
  );
}

function PolicyGrid({ vault }: { vault: Vault }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
      <PolicyChip label="Per tx" value={formatUsdc(vault.per_tx_limit_usdc)} />
      <PolicyChip label="Per hour" value={formatUsdc(vault.hourly_limit_usdc)} />
      <PolicyChip
        label="Lifetime"
        value={vault.lifetime_limit_usdc > 0 ? formatUsdcCompact(vault.lifetime_limit_usdc) : "uncapped"}
      />
      <PolicyChip label="Post-pay" value={vault.allow_post_pay ? "Enabled" : "Disabled"} />
      <PolicyChip label="Frozen" value={vault.frozen ? "Yes" : "No"} />
      <PolicyChip label="Updated" value={formatDate(vault.updated_at)} />
    </div>
  );
}

function Identifiers({ vault }: { vault: Vault }) {
  return (
    <div className="grid gap-2">
      <AddressPill label="vault" address={vault.pubkey} />
      <AddressPill label="agent" address={vault.agent} />
      <AddressPill label="usdc mint" address={vault.usdc_mint} dim />
      <AddressPill label="token acct" address={vault.vault_token_account} dim />
      <div className="mt-3 grid grid-cols-2 gap-3 text-[12.5px]">
        <Pair label="Created" value={`slot ${formatNumberCompact(vault.created_slot)}`} />
        <Pair label="Last active" value={`slot ${formatNumberCompact(vault.last_active_slot)}`} />
      </div>
    </div>
  );
}

function HeaderBadges({ vault, live }: { vault: Vault; live: ReturnType<typeof useLiveVault> }) {
  const backfill = useBackfillVault(vault.pubkey);
  return (
    <div className="flex items-center gap-2">
      <LiveBadge status={live.status} />
      <button
        type="button"
        onClick={() => backfill.mutate()}
        disabled={backfill.isPending}
        title="Replay this vault's on-chain history through the indexer. Safe to run anytime — it's idempotent."
        className="inline-flex h-8 items-center rounded-md border border-white/[0.16] bg-surface-2 px-3 font-mono text-[11.5px] text-fg-2 hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {backfill.isPending ? "Backfilling…" : "Backfill ↻"}
      </button>
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

// ---------- Owner actions ----------

function OwnerActions({ vault }: { vault: Vault }) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const qc = useQueryClient();
  const [open, setOpen] = useState<null | "deposit" | "policy">(null);
  const [freezing, setFreezing] = useState(false);

  const isOwner = publicKey?.toBase58() === vault.owner;

  const onToggleFreeze = async () => {
    if (!publicKey || !signTransaction) return;
    const next = !vault.frozen;
    setFreezing(true);
    try {
      await setFrozen({
        connection,
        wallet: { publicKey, signTransaction },
        owner: new PublicKey(vault.owner),
        agent: new PublicKey(vault.agent),
        frozen: next,
      });
      // Chain is now in the new state, but the backend mirror won't reflect it
      // until the Helius webhook fires and the indexer processes the event.
      // Patch the cache so the UI flips immediately; the invalidate keeps the
      // mirror as the source of truth once it catches up.
      qc.setQueryData<Vault>(queryKeys.vault(vault.pubkey), (old) =>
        old ? { ...old, frozen: next } : old,
      );
      void qc.invalidateQueries({ queryKey: queryKeys.vault(vault.pubkey) });
      toast.success(next ? "Vault frozen" : "Vault unfrozen");
    } catch (err) {
      toast.fromError(err, next ? "Freeze failed" : "Unfreeze failed");
    } finally {
      setFreezing(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen("deposit")}
          disabled={!isOwner}
          className="rounded-full border border-[var(--color-line-2)] px-3 py-1 font-mono text-[11px] text-fg-2 transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
          title={isOwner ? "Deposit USDC into this vault" : "Connect the owner wallet to manage"}
        >
          Deposit
        </button>
        <Link
          to={isOwner ? `/console/vaults/${vault.pubkey}/policy` : "#"}
          aria-disabled={!isOwner}
          className={`rounded-full border border-[var(--color-line-2)] px-3 py-1 font-mono text-[11px] transition ${
            isOwner
              ? "text-fg-2 hover:bg-surface-2"
              : "pointer-events-none cursor-not-allowed text-fg-2 opacity-40"
          }`}
          title={isOwner ? "Edit caps, post-pay, and whitelist" : "Connect the owner wallet to manage"}
        >
          Edit policy
        </Link>
        <button
          type="button"
          onClick={onToggleFreeze}
          disabled={!isOwner || freezing}
          className={`rounded-full border px-3 py-1 font-mono text-[11px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
            vault.frozen
              ? "border-mint/40 bg-mint/10 text-mint hover:bg-mint/15"
              : "border-[#E0857740] bg-[#E0857714] text-[#E08577] hover:bg-[#E0857720]"
          }`}
          title={
            isOwner
              ? vault.frozen
                ? "Unfreeze the vault — spends resume"
                : "Freeze the vault — every spend reverts until unfrozen"
              : "Connect the owner wallet to manage"
          }
        >
          {freezing ? "…" : vault.frozen ? "Unfreeze" : "Freeze"}
        </button>
      </div>
      {open === "deposit" && (
        <DepositModal vault={vault} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

function DepositModal({ vault, onClose }: { vault: Vault; onClose: () => void }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const qc = useQueryClient();
  const balances = useWalletBalances(vault.usdc_mint);
  const [amount, setAmount] = useState("1");
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [airdropping, setAirdropping] = useState(false);
  const [canAirdrop, setCanAirdrop] = useState(false);

  useEffect(() => {
    if (!wallet.publicKey) return;
    let cancelled = false;
    isMintAuthority(connection, wallet.publicKey, new PublicKey(vault.usdc_mint))
      .then((yes) => {
        if (!cancelled) setCanAirdrop(yes);
      })
      .catch(() => {
        if (!cancelled) setCanAirdrop(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connection, wallet.publicKey, vault.usdc_mint]);

  const onAirdrop = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) return;
    setError(null);
    setAirdropping(true);
    try {
      await mintTestUsdc({
        connection,
        wallet: { publicKey: wallet.publicKey, signTransaction: wallet.signTransaction },
        mint: new PublicKey(vault.usdc_mint),
        amountUsdcMicro: 50 * 1_000_000,
      });
      await balances.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAirdropping(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError("Wallet not connected");
      return;
    }
    const usdc = Number(amount);
    if (!Number.isFinite(usdc) || usdc <= 0) {
      setError("Amount must be a positive number");
      return;
    }
    setError(null);
    setStatus("submitting");
    try {
      const sig = await deposit({
        connection,
        wallet: {
          publicKey: wallet.publicKey,
          signTransaction: wallet.signTransaction,
        },
        owner: new PublicKey(vault.owner),
        agent: new PublicKey(vault.agent),
        mint: new PublicKey(vault.usdc_mint),
        amountUsdcMicro: Math.round(usdc * 1_000_000),
      });
      setSignature(sig);
      setStatus("done");
      await qc.invalidateQueries({ queryKey: queryKeys.vault(vault.pubkey) });
      await qc.invalidateQueries({ queryKey: queryKeys.vaultActivity(vault.pubkey) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("idle");
    }
  };

  return (
    <Modal title="Deposit USDC" onClose={onClose}>
      {status === "done" ? (
        <DoneState
          signature={signature ?? ""}
          message={`Deposited ${amount} test-USDC into the vault.`}
          onClose={onClose}
        />
      ) : (
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="flex items-baseline justify-between rounded-md border border-[var(--color-line)] bg-surface-2 px-3 py-2">
            <div className="grid gap-0.5">
              <span className="font-mono text-[10.5px] tracking-[0.06em] text-muted uppercase">
                Your wallet
              </span>
              <span className="font-mono text-[13px] text-mint">
                {balances.data ? `${formatUsdcWallet(balances.data.usdcMicro)} test-USDC` : "…"}
              </span>
            </div>
            {canAirdrop ? (
              <button
                type="button"
                onClick={onAirdrop}
                disabled={airdropping}
                className="font-mono text-[11px] text-mint-soft hover:text-mint disabled:opacity-50"
                title="Mint 50 more test-USDC to your wallet (you're the mint authority)"
              >
                {airdropping ? "minting…" : "+ mint 50"}
              </button>
            ) : null}
          </div>
          <Field label="Amount (test-USDC)">
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              className="w-full rounded-md border border-[var(--color-line-2)] bg-surface px-3 py-2 font-mono text-[13px] text-fg outline-none focus:border-mint-soft"
            />
          </Field>
          <p className="m-0 text-[12px] text-muted">
            Transfers from your wallet's USDC ATA to the vault's token account. Owner-signed.
          </p>
          {error && <ErrorLine text={error} />}
          <ModalFooter
            submitLabel={status === "submitting" ? "Submitting…" : "Deposit"}
            submitting={status === "submitting"}
            onClose={onClose}
          />
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
  children: React.ReactNode;
  onClose: () => void;
}) {
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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
