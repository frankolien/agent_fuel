import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useQueryClient } from "@tanstack/react-query";
import { useVaultsQuery } from "@/lib/api/hooks";
import { queryKeys } from "@/lib/api/keys";
import { createVault } from "@/lib/owner-actions";
import { AgentModeSelector, type AgentChoice } from "../components/AgentMode";
import {
  formatUsdc,
  formatUsdcCompact,
  microUsdcToDollars,
  shortPubkey,
} from "@/lib/format";
import { vaultBalance, type Vault } from "@/types/api";
import { Screen } from "./Screen";
import { Gauge } from "../components/Gauge";
import { SkeletonRows } from "../components/Skeleton";

// Devnet test-USDC mint deployed by `npm run devnet:bootstrap`. Users can
// paste their own mint in the form — this is just the default for the demo.
const DEFAULT_DEVNET_USDC_MINT = "GxAHHLN4qZtiHXKiTNFebXbbMWzgFBy4AGaiDJEY8xdf";

export function Vaults() {
  const { data, isLoading, error } = useVaultsQuery();
  const { publicKey } = useWallet();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <Screen
      eyebrow="Treasury"
      title="Vaults"
      subtitle="USDC-funded credit vaults and policies."
      actions={
        <div className="flex items-center gap-3">
          {data ? (
            <span className="font-mono text-[11.5px] tracking-[0.06em] text-muted uppercase">
              {data.length} total
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            disabled={!publicKey}
            className="rounded-full bg-mint px-4 py-1.5 text-[12.5px] font-semibold text-bg transition hover:bg-mint-soft disabled:cursor-not-allowed disabled:opacity-40"
            title={publicKey ? "Create a new credit vault" : "Connect a wallet to create a vault"}
          >
            + New vault
          </button>
        </div>
      }
    >
      {isLoading ? <SkeletonRows rows={6} height={68} /> : null}
      {error ? <ErrorState message={(error as Error).message} /> : null}
      {data ? <VaultsTable vaults={data} /> : null}
      {createOpen && <CreateVaultModal onClose={() => setCreateOpen(false)} />}
    </Screen>
  );
}

function CreateVaultModal({ onClose }: { onClose: () => void }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const qc = useQueryClient();
  const [agentChoice, setAgentChoice] = useState<AgentChoice>({ mode: "wallet" });
  const [mint, setMint] = useState(DEFAULT_DEVNET_USDC_MINT);
  const [perTx, setPerTx] = useState("1");
  const [hourly, setHourly] = useState("5");
  const [lifetime, setLifetime] = useState("100");
  const [allowPostPay, setAllowPostPay] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [vaultPubkey, setVaultPubkey] = useState<string | null>(null);
  const [createdAgent, setCreatedAgent] = useState<string | null>(null);

  const submitDisabled =
    status === "submitting" ||
    (agentChoice.mode === "generate" && !agentChoice.downloaded);

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
      const mintPk = new PublicKey(mint); // throws on invalid base58
      const { signature: sig, vault } = await createVault({
        connection,
        wallet: { publicKey: wallet.publicKey, signTransaction: wallet.signTransaction },
        ...(agentChoice.mode === "generate" ? { agentKeypair: agentChoice.keypair } : {}),
        mint: mintPk,
        perTxUsdcMicro: toMicro(perTx, "Per-tx"),
        hourlyUsdcMicro: toMicro(hourly, "Hourly"),
        lifetimeUsdcMicro: toMicro(lifetime, "Lifetime"),
        allowPostPay,
      });
      setSignature(sig);
      setVaultPubkey(vault.toBase58());
      setCreatedAgent(
        (agentChoice.mode === "generate"
          ? agentChoice.keypair.publicKey
          : wallet.publicKey
        ).toBase58(),
      );
      setStatus("done");
      await qc.invalidateQueries({ queryKey: queryKeys.vaults() });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("idle");
    }
  };

  return (
    <Modal title="Create vault" onClose={onClose}>
      {status === "done" ? (
        <div className="grid gap-4">
          <p className="m-0 text-[14px] text-fg-2">
            Vault created. If you generated a new agent keypair, you'll need its secret in your
            bot's config to sign spends.
          </p>
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
          {createdAgent && createdAgent !== wallet.publicKey?.toBase58() ? (
            <div className="grid gap-1.5">
              <span className="font-mono text-[10.5px] tracking-[0.06em] text-muted uppercase">
                Agent
              </span>
              <span className="block truncate font-mono text-[12px] text-mint-soft">
                {createdAgent}
              </span>
            </div>
          ) : null}
          <a
            href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate font-mono text-[11.5px] text-muted hover:text-fg"
          >
            tx {signature}
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
      ) : (
        <form onSubmit={onSubmit} className="grid gap-4">
          <AgentModeSelector
            ownerPubkey={wallet.publicKey ?? null}
            onChange={setAgentChoice}
          />
          <Field label="USDC mint">
            <input
              type="text"
              value={mint}
              onChange={(e) => setMint(e.target.value)}
              spellCheck={false}
              className="w-full rounded-md border border-[var(--color-line-2)] bg-surface px-3 py-2 font-mono text-[12px] text-fg outline-none focus:border-mint-soft"
            />
            <span className="mt-1 font-mono text-[10.5px] text-muted">
              Devnet test mint pre-filled — paste your own to use a different one.
            </span>
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
            <span className="font-mono text-[10.5px] text-muted">
              (advanced — leaves overdraft enabled for the agent)
            </span>
          </label>
          <p className="m-0 text-[12px] text-muted">
            Owner is your connected wallet (
            <span className="font-mono">{wallet.publicKey ? shortPubkey(wallet.publicKey.toBase58()) : "—"}</span>
            ). Owner pays the rent (~0.005 SOL).
          </p>
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
              disabled={submitDisabled}
              title={
                agentChoice.mode === "generate" && !agentChoice.downloaded
                  ? "Download the agent keypair JSON first"
                  : undefined
              }
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
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-fg">
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
  const limit = vault.lifetime_limit_usdc;
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
        <span className="font-mono text-[13px]">{formatUsdc(vaultBalance(vault))}</span>
      </Td>
      <Td>
        <div className="grid min-w-[180px] gap-1">
          <Gauge fraction={fraction} thresholds={[0.7, 0.8, 0.9]} tone={tone} />
          <span className="font-mono text-[10.5px] text-muted">
            {limit > 0 ? `${pct}% of ${formatUsdcCompact(limit)}` : "uncapped"}
          </span>
        </div>
      </Td>
      <Td align="right">
        <span className="font-mono text-[12.5px] text-fg-2">{formatUsdc(vault.per_tx_limit_usdc)}</span>
      </Td>
      <Td align="right">
        <span className="font-mono text-[12.5px] text-fg-2">{formatUsdc(vault.hourly_limit_usdc)}</span>
      </Td>
      <Td align="right">
        <StatusBadge vault={vault} pct={pct} />
      </Td>
    </tr>
  );
}

function StatusBadge({ vault, pct }: { vault: Vault; pct: number }) {
  if (vault.frozen) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E0857714] px-2 py-0.5 font-mono text-[10.5px] tracking-[0.06em] text-[#E08577] uppercase">
        <span className="h-1.5 w-1.5 rounded-full bg-[#E08577]" />
        Frozen
      </span>
    );
  }
  if (pct >= 90) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E0857714] px-2 py-0.5 font-mono text-[10.5px] tracking-[0.06em] text-[#E08577] uppercase">
        {pct}% spent
      </span>
    );
  }
  if (pct >= 70) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E6B86F14] px-2 py-0.5 font-mono text-[10.5px] tracking-[0.06em] text-[#E6B86F] uppercase">
        {pct}% spent
      </span>
    );
  }
  const dollars = microUsdcToDollars(vaultBalance(vault));
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
