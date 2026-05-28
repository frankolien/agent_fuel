import { useEffect, useState, type ReactNode } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useQueryClient } from "@tanstack/react-query";
import { useServicesQuery } from "@/lib/api/hooks";
import { formatNumberCompact, formatUsdcCompact, shortPubkey } from "@/lib/format";
import { registerService, type ServiceCategory } from "@/lib/owner-actions";
import type { Service } from "@/types/api";
import { Screen } from "./Screen";
import { SkeletonRows } from "../components/Skeleton";

const CATEGORIES: ServiceCategory[] = ["DataFeed", "Compute", "Swap", "Rpc", "Other"];

const CATEGORY_LABEL: Record<Service["category"], string> = {
  DataFeed: "data feed",
  Compute: "compute",
  Swap: "swap",
  Rpc: "rpc",
  Other: "other",
};

export function Services() {
  const { data, isLoading, error } = useServicesQuery();
  const { publicKey } = useWallet();
  const [registerOpen, setRegisterOpen] = useState(false);

  return (
    <Screen
      eyebrow={
        <>
          <span>x402 service providers</span>
          <span className="text-muted">·</span>
          <span>on-chain registry</span>
        </>
      }
      title="Services"
      subtitle="Whitelisted x402 providers your agents can pay."
      actions={
        <div className="flex items-center gap-3">
          {data ? (
            <span className="font-mono text-[11.5px] tracking-[0.06em] text-muted uppercase">
              {data.length} registered
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setRegisterOpen(true)}
            disabled={!publicKey}
            className="rounded-full bg-mint px-4 py-1.5 text-[12.5px] font-semibold text-bg transition hover:bg-mint-soft disabled:cursor-not-allowed disabled:opacity-40"
            title={publicKey ? "Register your wallet as a service" : "Connect a wallet first"}
          >
            + Register service
          </button>
        </div>
      }
    >
      {isLoading ? <SkeletonRows rows={6} height={56} /> : null}
      {error ? <ErrorState message={(error as Error).message} /> : null}
      {data ? <ServicesTable services={data} /> : null}
      {registerOpen && <RegisterServiceModal onClose={() => setRegisterOpen(false)} />}
    </Screen>
  );
}

function ServicesTable({ services }: { services: ReadonlyArray<Service> }) {
  if (services.length === 0) {
    return (
      <div className="grid place-items-center rounded-[10px] border border-dashed border-white/[0.09] bg-surface/40 px-6 py-20 text-center text-[13px] text-muted">
        No services registered on chain yet. Click "+ Register service" to add the first one.
      </div>
    );
  }
  // Sort by total volume desc — most active providers float to the top.
  const sorted = [...services].sort(
    (a, b) => b.total_volume_received_usdc - a.total_volume_received_usdc,
  );
  return (
    <div className="overflow-hidden rounded-[10px] border border-white/[0.09] bg-[#0e0f11]">
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left">
            <Th>Service</Th>
            <Th>Category</Th>
            <Th align="right">Lifetime spend</Th>
            <Th align="right">Agents served</Th>
            <Th align="right">Status</Th>
            <Th>Address</Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((svc) => (
            <ServiceRow key={svc.registry} service={svc} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ServiceRow({ service }: { service: Service }) {
  return (
    <tr className="border-t border-white/[0.05] hover:bg-white/[0.02]">
      <Td>
        <div className="flex items-center gap-2">
          <CategoryDot category={service.category} />
          <span className="text-[13.5px] text-fg">{service.name || "unnamed"}</span>
        </div>
      </Td>
      <Td>
        <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[10.5px] tracking-[0.04em] text-fg-2">
          {CATEGORY_LABEL[service.category]}
        </span>
      </Td>
      <Td align="right">
        <span className="font-mono text-[13px]">
          {formatUsdcCompact(service.total_volume_received_usdc)}
        </span>
      </Td>
      <Td align="right">
        <span className="font-mono text-[12.5px] text-fg-2">
          {formatNumberCompact(service.total_agents_served)}
        </span>
      </Td>
      <Td align="right">
        {service.active ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2 py-0.5 font-mono text-[10.5px] tracking-[0.06em] text-mint uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-mint" />
            active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2 py-0.5 font-mono text-[10.5px] tracking-[0.06em] text-muted uppercase">
            inactive
          </span>
        )}
      </Td>
      <Td>
        <CopyAddress address={service.pubkey} />
      </Td>
    </tr>
  );
}

function CategoryDot({ category }: { category: Service["category"] }) {
  const tone: Record<Service["category"], string> = {
    DataFeed: "bg-mint",
    Compute: "bg-fg",
    Rpc: "bg-mint-soft",
    Swap: "bg-[#5BC0EB]",
    Other: "bg-muted",
  };
  return <span className={`inline-block h-2 w-2 rounded-sm ${tone[category]}`} />;
}

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      className="group inline-flex items-center gap-1.5 rounded-md border border-[var(--color-line)] bg-surface-2 px-2 py-1 font-mono text-[11.5px] text-fg-2 hover:border-[var(--color-line-2)] hover:text-fg"
      title={address}
    >
      <span>{shortPubkey(address)}</span>
      <span className="text-muted group-hover:text-fg-2">{copied ? "✓" : "⧉"}</span>
    </button>
  );
}

function RegisterServiceModal({ onClose }: { onClose: () => void }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ServiceCategory>("Other");
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [registry, setRegistry] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError("Wallet not connected");
      return;
    }
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setError(null);
    setStatus("submitting");
    try {
      const { signature: sig, registry: pda } = await registerService({
        connection,
        wallet: { publicKey: wallet.publicKey, signTransaction: wallet.signTransaction },
        name: name.trim(),
        category,
      });
      setSignature(sig);
      setRegistry(pda.toBase58());
      setStatus("done");
      await qc.invalidateQueries({ queryKey: ["services"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("idle");
    }
  };

  return (
    <Modal title="Register service" onClose={onClose}>
      {status === "done" ? (
        <div className="grid gap-4">
          <p className="m-0 text-[14px] text-fg-2">
            Registered. Agents can now spend USDC against this service via x402.
          </p>
          <Labelled label="Registry">
            <span className="block truncate font-mono text-[12px] text-mint-soft">{registry}</span>
          </Labelled>
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
          <Field label="Service name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              placeholder="e.g. helix-rpc"
              autoFocus
              className="w-full rounded-md border border-[var(--color-line-2)] bg-surface px-3 py-2 font-mono text-[13px] text-fg outline-none focus:border-mint-soft"
            />
            <span className="mt-1 font-mono text-[10.5px] text-muted">32 bytes max</span>
          </Field>
          <Field label="Category">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`rounded-full border px-3 py-1 font-mono text-[11.5px] transition ${
                    category === c
                      ? "border-mint bg-mint/15 text-mint"
                      : "border-[var(--color-line-2)] text-fg-2 hover:bg-surface-2"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </Field>
          <p className="m-0 text-[12px] text-muted">
            Registers your connected wallet (
            <span className="font-mono">
              {wallet.publicKey ? shortPubkey(wallet.publicKey.toBase58()) : "—"}
            </span>
            ) as the service authority. One service per wallet.
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
              disabled={status === "submitting"}
              className="rounded-full bg-mint px-4 py-2 text-[12.5px] font-semibold text-bg hover:bg-mint-soft disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === "submitting" ? "Submitting…" : "Register"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
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

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="font-mono text-[10.5px] tracking-[0.06em] text-muted uppercase">{label}</span>
      {children}
    </div>
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
      Couldn't load services — <span className="font-mono">{message}</span>
    </div>
  );
}
