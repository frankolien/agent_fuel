// Mode selector for choosing how the agent identity is materialised on a
// vault/init-agent flow:
//
//   • "generate" (default, recommended): fresh keypair created in the browser.
//     The secret must be downloaded by the user before the form will submit —
//     once the tx lands the keypair lives only in the user's downloaded file.
//   • "wallet": owner == agent. Single key for both roles. Fast for demos but
//     no security separation; the agent's compromise == owner's compromise.
//
// Parent gets the chosen mode + (when generate) the Keypair via `onChange`,
// plus a `ready` boolean it should gate its submit button on.

import { useEffect, useMemo, useRef, useState } from "react";
import { Keypair, type PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

export type AgentMode = "generate" | "wallet";

export type AgentChoice =
  | { mode: "generate"; keypair: Keypair; downloaded: boolean }
  | { mode: "wallet" };

type Props = {
  ownerPubkey: PublicKey | null;
  onChange: (choice: AgentChoice) => void;
};

export function AgentModeSelector({ ownerPubkey, onChange }: Props) {
  const [mode, setMode] = useState<AgentMode>("generate");
  const [downloaded, setDownloaded] = useState(false);
  const [secretRevealed, setSecretRevealed] = useState(false);

  // Generate the keypair once on first render and keep it stable across
  // re-renders. Regenerate only if the user toggles away and back.
  const generatedRef = useRef<Keypair | null>(null);
  const generated = useMemo(() => {
    if (!generatedRef.current) generatedRef.current = Keypair.generate();
    return generatedRef.current;
  }, []);

  // Re-emit choice whenever any input changes.
  useEffect(() => {
    if (mode === "wallet") onChange({ mode: "wallet" });
    else onChange({ mode: "generate", keypair: generated, downloaded });
  }, [mode, generated, downloaded, onChange]);

  const onDownload = () => {
    const json = JSON.stringify(Array.from(generated.secretKey));
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const shortPk = `${generated.publicKey.toBase58().slice(0, 4)}-${generated.publicKey.toBase58().slice(-4)}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `agent-${shortPk}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloaded(true);
  };

  const onCopySecret = async () => {
    const b58 = bs58.encode(generated.secretKey);
    try {
      await navigator.clipboard.writeText(b58);
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
          title="Generate new agent"
          subtitle="Fresh keypair. Recommended."
        />
        <ModeCard
          active={mode === "wallet"}
          onClick={() => {
            setMode("wallet");
            setDownloaded(false);
            setSecretRevealed(false);
          }}
          title="Use this wallet"
          subtitle="Quick start. Owner == agent."
        />
      </div>

      {mode === "generate" ? (
        <div className="grid gap-3 rounded-md border border-[var(--color-line-2)] bg-surface-2 p-3">
          <div className="grid gap-1">
            <span className="font-mono text-[10.5px] tracking-[0.06em] text-muted uppercase">
              Generated agent pubkey
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
                    paste into your bot's <code>AGENT_KEYPAIR</code> (base58)
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
            The keypair is generated in your browser and will be discarded after this transaction.
            Save it before you submit — without the secret, your bot can't sign spends. The owner
            wallet (
            <span className="font-mono">
              {ownerPubkey ? shortPk(ownerPubkey.toBase58()) : "—"}
            </span>
            ) keeps full control of funding and policy.
          </p>
        </div>
      ) : (
        <p className="m-0 rounded-md border border-[var(--color-line)] bg-surface-2 px-3 py-2 text-[11.5px] leading-relaxed text-muted">
          Your connected wallet plays both roles. Simpler, but if the agent process is
          compromised, the attacker can also change policy, withdraw funds, and freeze. Use{" "}
          <span className="text-fg">Generate new agent</span> for any real deployment.
        </p>
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

function shortPk(s: string): string {
  return s.length > 12 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
}
