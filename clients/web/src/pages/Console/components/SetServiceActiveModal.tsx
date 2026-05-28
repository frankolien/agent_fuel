// Pause / resume a service by uploading the service keypair JSON the user
// downloaded at registration time. The service authority signs alone — the
// wallet only acts as fee-payer (rare; usually they're the same person).

import { useEffect, useState, type ReactNode } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair } from "@solana/web3.js";
import { useQueryClient } from "@tanstack/react-query";
import { setServiceActive } from "@/lib/owner-actions";

type Props = {
  serviceLabel: string;
  expectedServicePubkey: string;
  setActive: boolean;
  onClose: () => void;
};

export function SetServiceActiveModal({
  serviceLabel,
  expectedServicePubkey,
  setActive,
  onClose,
}: Props) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const qc = useQueryClient();
  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  const onFile = async (file: File) => {
    setParseError(null);
    setKeypair(null);
    try {
      const text = await file.text();
      const arr = JSON.parse(text);
      if (!Array.isArray(arr) || arr.length !== 64) {
        throw new Error("Expected a Solana keypair JSON (64-element array).");
      }
      const kp = Keypair.fromSecretKey(Uint8Array.from(arr));
      if (kp.publicKey.toBase58() !== expectedServicePubkey) {
        throw new Error(
          `That keypair is ${kp.publicKey.toBase58().slice(0, 4)}…${kp.publicKey
            .toBase58()
            .slice(-4)} — doesn't match this service.`,
        );
      }
      setKeypair(kp);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.publicKey || !wallet.signTransaction || !keypair) return;
    setError(null);
    setStatus("submitting");
    try {
      const sig = await setServiceActive({
        connection,
        wallet: { publicKey: wallet.publicKey, signTransaction: wallet.signTransaction },
        serviceKeypair: keypair,
        active: setActive,
      });
      setSignature(sig);
      setStatus("done");
      await qc.invalidateQueries({ queryKey: ["services"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("idle");
    }
  };

  return (
    <Modal title={setActive ? "Resume service" : "Pause service"} onClose={onClose}>
      {status === "done" ? (
        <div className="grid gap-4">
          <p className="m-0 text-[14px] text-fg-2">
            {serviceLabel} is now <span className="text-mint">{setActive ? "active" : "paused"}</span>.
          </p>
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
          <p className="m-0 text-[12.5px] text-muted">
            {setActive ? "Resuming" : "Pausing"}{" "}
            <span className="font-mono text-fg-2">{serviceLabel}</span>. Drop the keypair JSON you
            downloaded when registering — only the service authority can flip this bit.
          </p>

          <label className="grid cursor-pointer gap-1.5">
            <span className="font-mono text-[10.5px] tracking-[0.06em] text-muted uppercase">
              service keypair JSON
            </span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
              className="block w-full cursor-pointer rounded-md border border-dashed border-[var(--color-line-2)] bg-surface px-3 py-3 text-[12px] text-fg-2 file:mr-3 file:rounded-full file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:text-fg file:hover:bg-surface-3"
            />
          </label>

          {keypair ? (
            <div className="rounded-md border border-mint/30 bg-mint/[0.06] px-3 py-2 font-mono text-[11.5px] text-mint">
              ✓ matches service authority
            </div>
          ) : parseError ? (
            <div className="rounded-md border border-[#E0857733] bg-[#E0857714] px-3 py-2 text-[12px] text-[#E08577]">
              {parseError}
            </div>
          ) : null}

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
              disabled={!keypair || status === "submitting"}
              className="rounded-full bg-mint px-4 py-2 text-[12.5px] font-semibold text-bg hover:bg-mint-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "submitting" ? "Submitting…" : setActive ? "Resume" : "Pause"}
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
