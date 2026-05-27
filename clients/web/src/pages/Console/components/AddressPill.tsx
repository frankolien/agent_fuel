import { useState } from "react";
import { shortPubkey } from "@/lib/format";

type AddressPillProps = {
  label?: string;
  address: string;
  dim?: boolean;
};

export function AddressPill({ label, address, dim }: AddressPillProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore — insecure origin or no permission
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      title={copied ? "Copied" : address}
      className={
        "inline-flex items-center gap-2 rounded-md border border-white/[0.09] bg-surface-2 px-2 py-1 font-mono text-[11.5px] hover:border-white/[0.16] hover:text-fg " +
        (dim ? "text-muted" : "text-fg-2")
      }
    >
      {label ? (
        <span className="text-[10px] tracking-[0.06em] text-muted uppercase">{label}</span>
      ) : null}
      <span>{shortPubkey(address)}</span>
      <span className="text-[10px] text-muted">{copied ? "✓" : "⎘"}</span>
    </button>
  );
}
