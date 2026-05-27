import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type KpiProps = {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  hero?: boolean;
  className?: string;
};

export function Kpi({ label, value, sub, hero, className }: KpiProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[10px] border border-white/[0.09] bg-[#0e0f11]",
        hero ? "min-h-[172px] px-6 pt-5 pb-5" : "min-h-[120px] px-5 pt-[18px] pb-5",
        hero &&
          "bg-[radial-gradient(140%_100%_at_100%_0%,rgba(166,225,207,0.10),transparent_55%),linear-gradient(180deg,#15181B_0%,#0B0C0E_100%)] border-white/[0.16]",
        className,
      )}
    >
      <div className={cn("text-muted text-[12px] tracking-[0.02em]", hero && "text-[12.5px] text-fg-2")}>
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-medium tracking-[-0.02em] text-mint [text-shadow:0_0_24px_rgba(166,225,207,0.3)]",
          hero ? "text-[42px]" : "text-[26px]",
        )}
      >
        {value}
      </div>
      {sub ? <div className="mt-1.5 text-[12.5px] text-muted">{sub}</div> : null}
    </div>
  );
}

export function KpiStrip({ children }: { children: ReactNode }) {
  return <div className="mb-[18px] grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-4">{children}</div>;
}
