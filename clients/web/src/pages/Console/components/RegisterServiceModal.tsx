import { useEffect, useState, type ReactNode } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useQueryClient } from "@tanstack/react-query";
import { shortPubkey } from "@/lib/format";
import { registerService, type ServiceCategory } from "@/lib/owner-actions";
import { ServiceKeypairSelector, type ServiceChoice } from "./ServiceKeypair";

const CATEGORIES: ServiceCategory[] = ["DataFeed", "Compute", "Swap", "Rpc", "Other"];

export function RegisterServiceModal({ onClose }: { onClose: () => void }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const qc = useQueryClient();
  const [choice, setChoice] = useState<ServiceChoice>({
    mode: "generate",
    // Placeholder: ServiceKeypairSelector replaces this on first onChange.
    keypair: null as unknown as never,
    downloaded: false,
  });
  const [name, setName] = useState("");
  const [serviceUri, setServiceUri] = useState("");
  const [category, setCategory] = useState<ServiceCategory>("Other");
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [registry, setRegistry] = useState<string | null>(null);
  const [registeredPubkey, setRegisteredPubkey] = useState<string | null>(null);

  const ready =
    name.trim().length > 0 &&
    ((choice.mode === "generate" && choice.downloaded && choice.keypair) ||
      (choice.mode === "import" && choice.keypair !== null));

  const submitDisabled = !ready || status === "submitting" || !wallet.publicKey;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError("Wallet not connected");
      return;
    }
    const serviceKeypair = choice.keypair;
    if (!serviceKeypair) {
      setError(
        choice.mode === "generate"
          ? "Download the keypair JSON first"
          : "Paste a valid base58 secret",
      );
      return;
    }
    setError(null);
    setStatus("submitting");
    try {
      const { signature: sig, registry: pda } = await registerService({
        connection,
        wallet: { publicKey: wallet.publicKey, signTransaction: wallet.signTransaction },
        serviceKeypair,
        name: name.trim(),
        category,
        ...(serviceUri.trim() ? { serviceUri: serviceUri.trim() } : {}),
      });
      setSignature(sig);
      setRegistry(pda.toBase58());
      setRegisteredPubkey(serviceKeypair.publicKey.toBase58());
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
          <Labelled label="Service pubkey">
            <span className="block truncate font-mono text-[12px] text-mint-soft">
              {registeredPubkey}
            </span>
          </Labelled>
          <Labelled label="Registry PDA">
            <span className="block truncate font-mono text-[12px] text-fg-2">{registry}</span>
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
          <ServiceKeypairSelector onChange={setChoice} />

          <Field label="Service name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              placeholder="e.g. helix-rpc"
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

          <Field label="Metadata URI (optional)">
            <input
              type="text"
              value={serviceUri}
              onChange={(e) => setServiceUri(e.target.value)}
              maxLength={128}
              placeholder="https://example.com/service.json"
              className="w-full rounded-md border border-[var(--color-line-2)] bg-surface px-3 py-2 font-mono text-[12px] text-fg outline-none focus:border-mint-soft"
            />
            <span className="mt-1 font-mono text-[10.5px] text-muted">
              Off-chain JSON: pricing, docs, endpoint, logo. 128 bytes max.
            </span>
          </Field>

          <p className="m-0 text-[12px] text-muted">
            Sponsor (rent payer):{" "}
            <span className="font-mono">
              {wallet.publicKey ? shortPubkey(wallet.publicKey.toBase58()) : "—"}
            </span>
            . The service signs alongside but never holds SOL.
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
                choice.mode === "generate" && !choice.downloaded
                  ? "Download the keypair JSON first"
                  : choice.mode === "import" && !choice.keypair
                    ? "Paste a valid base58 secret"
                    : undefined
              }
              className="rounded-full bg-mint px-4 py-2 text-[12.5px] font-semibold text-bg hover:bg-mint-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "submitting" ? "Submitting…" : "Register"}
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
        className="w-full max-w-[520px] rounded-[16px] border border-[var(--color-line-2)] bg-surface p-6 shadow-2xl"
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
