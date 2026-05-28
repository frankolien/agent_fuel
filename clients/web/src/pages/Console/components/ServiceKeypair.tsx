// Service identity keypair picker. Same idea as AgentModeSelector but without
// the "use my wallet" option — a service signs `claim` / `give_feedback` /
// `revoke_feedback` continuously server-side. A Phantom-controlled service
// can't do that, so the wallet-as-service path simply isn't a sane choice.
//
// Modes:
//   • generate (default, recommended): fresh keypair in-browser. Must be
//     downloaded before submit; afterwards the secret lives only in the file
//     the user just saved. The PDA is derived from this keypair, so once it's
//     gone, the service is unrecoverable.
//   • import: paste a base58 secret key. For someone who already has a service
//     identity (a backend that's been signing for a while elsewhere) and wants
//     to register it on this network.

import { useEffect, useMemo, useRef, useState } from "react";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

export type ServiceMode = "generate" | "import";

export type ServiceChoice =
  | { mode: "generate"; keypair: Keypair; downloaded: boolean }
  | { mode: "import"; keypair: Keypair | null; error: string | null };

type Props = {
  onChange: (choice: ServiceChoice) => void;
};

export function ServiceKeypairSelector({ onChange }: Props) {
  const [mode, setMode] = useState<ServiceMode>("generate");
  const [downloaded, setDownloaded] = useState(false);
  const [secretRevealed, setSecretRevealed] = useState(false);
  const [importInput, setImportInput] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  // One keypair per mount; toggling away and back keeps the same generated key
  // so users don't accidentally lose the one they just downloaded.
  const generatedRef = useRef<Keypair | null>(null);
  const generated = useMemo(() => {
    if (!generatedRef.current) generatedRef.current = Keypair.generate();
    return generatedRef.current;
  }, []);

  // Imported keypair derived once per input change; null if invalid.
  const imported = useMemo<{ keypair: Keypair | null; error: string | null }>(() => {
    const trimmed = importInput.trim();
    if (!trimmed) return { keypair: null, error: null };
    try {
      const secret = bs58.decode(trimmed);
      if (secret.length !== 64) {
        return { keypair: null, error: `Expected 64-byte secret, got ${secret.length}` };
      }
      return { keypair: Keypair.fromSecretKey(secret), error: null };
    } catch {
      return { keypair: null, error: "Not a valid base58 secret" };
    }
  }, [importInput]);

  useEffect(() => {
    setImportError(imported.error);
  }, [imported.error]);

  // Re-emit on any input change.
  useEffect(() => {
    if (mode === "generate") {
      onChange({ mode: "generate", keypair: generated, downloaded });
    } else {
      onChange({ mode: "import", keypair: imported.keypair, error: imported.error });
    }
  }, [mode, generated, downloaded, imported.keypair, imported.error, onChange]);

  const onDownload = () => {
    const json = JSON.stringify(Array.from(generated.secretKey));
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const shortPk = `${generated.publicKey.toBase58().slice(0, 4)}-${generated.publicKey.toBase58().slice(-4)}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `service-${shortPk}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloaded(true);
  };

  const onCopySecret = async () => {
    try {
      await navigator.clipboard.writeText(bs58.encode(generated.secretKey));
    } catch {
      // ignore
    }
  };

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        <ModeCard
          active={mode === "generate"}
          onClick={() => setMode("generate")}
          title="Generate new service keypair"
          subtitle="Fresh identity. Recommended."
        />
        <ModeCard
          active={mode === "import"}
          onClick={() => setMode("import")}
          title="Import existing"
          subtitle="Paste a base58 secret."
        />
      </div>

      {mode === "generate" ? (
        <div className="grid gap-3 rounded-md border border-[var(--color-line-2)] bg-surface-2 p-3">
          <div className="grid gap-1">
            <span className="font-mono text-[10.5px] tracking-[0.06em] text-muted uppercase">
              Generated service pubkey
            </span>
            <span className="font-mono text-[11.5px] break-all text-mint-soft">
              {generated.publicKey.toBase58()}
            </span>
          </div>

          <div className="grid gap-1.5 rounded-md border border-[#E6B86F33] bg-[#E6B86F0F] p-2.5">
            <span className="font-mono text-[10.5px] tracking-[0.06em] text-[#E6B86F] uppercase">
              Secret · shown once
            </span>
            {secretRevealed ? (
              <div className="grid gap-1.5">
                <code className="block max-h-[80px] overflow-y-auto rounded bg-bg/60 p-2 font-mono text-[10.5px] break-all text-fg-2">
                  {bs58.encode(generated.secretKey)}
                </code>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onCopySecret}
                    className="rounded-full border border-[var(--color-line-2)] px-2.5 py-0.5 font-mono text-[10.5px] text-fg-2 hover:bg-surface-2"
                  >
                    copy
                  </button>
                  <span className="font-mono text-[10.5px] text-muted">
                    paste into your service's <code>SERVICE_KEYPAIR</code> (base58)
                  </span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSecretRevealed(true)}
                className="self-start rounded-full border border-[var(--color-line-2)] px-3 py-1 font-mono text-[11px] text-fg-2 hover:bg-surface-3"
              >
                reveal secret
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onDownload}
            className={`rounded-md px-3 py-2 text-[12.5px] font-medium transition ${
              downloaded
                ? "border border-mint/40 bg-mint/10 text-mint"
                : "border border-[var(--color-line-2)] bg-surface text-fg hover:bg-surface-3"
            }`}
          >
            {downloaded ? "✓ keypair JSON downloaded" : "↓ Download keypair JSON"}
          </button>

          <p className="m-0 text-[11.5px] leading-relaxed text-muted">
            Your wallet (sponsor) pays rent — the service key never needs SOL. Save the secret
            before submitting; your backend will load it to sign <code>claim</code> /{" "}
            <code>give_feedback</code> transactions.
          </p>
        </div>
      ) : (
        <div className="grid gap-2 rounded-md border border-[var(--color-line-2)] bg-surface-2 p-3">
          <span className="font-mono text-[10.5px] tracking-[0.06em] text-muted uppercase">
            Base58 secret (64 bytes)
          </span>
          <textarea
            value={importInput}
            onChange={(e) => setImportInput(e.target.value)}
            spellCheck={false}
            rows={3}
            placeholder="paste service secret…"
            className="w-full resize-none rounded-md border border-[var(--color-line-2)] bg-surface px-3 py-2 font-mono text-[11.5px] break-all text-fg outline-none focus:border-mint-soft"
          />
          {imported.keypair ? (
            <span className="font-mono text-[11px] text-mint-soft">
              ✓ {imported.keypair.publicKey.toBase58()}
            </span>
          ) : importError ? (
            <span className="font-mono text-[11px] text-[#E08577]">{importError}</span>
          ) : (
            <span className="font-mono text-[10.5px] text-muted">
              Stays in your browser; never sent to a server.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid gap-0.5 rounded-md border px-3 py-2.5 text-left transition ${
        active
          ? "border-mint bg-mint/10 text-fg"
          : "border-[var(--color-line)] bg-surface-2 text-fg-2 hover:bg-surface-3"
      }`}
    >
      <span className="text-[12.5px] font-medium">{title}</span>
      <span className="font-mono text-[10.5px] text-muted">{subtitle}</span>
    </button>
  );
}
