import type { ReactNode } from "react";

type PolicyChipProps = {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
};

export function PolicyChip({ label, value, sub }: PolicyChipProps) {
  return (
    <div className="grid gap-1 rounded-md border border-white/[0.09] bg-surface-2 px-3 py-2.5">
      <span className="font-mono text-[10.5px] tracking-[0.06em] text-muted uppercase">{label}</span>
      <span className="font-mono text-[14px] text-fg">{value}</span>
      {sub ? <span className="font-mono text-[11px] text-muted">{sub}</span> : null}
    </div>
  );
}
