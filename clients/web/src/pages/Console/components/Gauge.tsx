import { cn } from "@/lib/cn";

type GaugeProps = {
  /** 0 → 1. Values outside the range are clamped for the bar fill. */
  fraction: number;
  /** Optional notches drawn as 1px ticks above the bar — e.g. budget alert thresholds. */
  thresholds?: ReadonlyArray<number>;
  height?: number;
  className?: string;
  /** Mint by default; pass another CSS color for danger states. */
  tone?: "mint" | "warn" | "danger";
};

const TONE_FROM: Record<NonNullable<GaugeProps["tone"]>, string> = {
  mint: "from-mint-soft to-mint",
  warn: "from-[#E6B86F] to-[#E6B86F]",
  danger: "from-[#E08577] to-[#E08577]",
};

export function Gauge({ fraction, thresholds = [], height = 8, className, tone = "mint" }: GaugeProps) {
  const clamped = Math.max(0, Math.min(1, fraction));
  return (
    <div className={cn("relative w-full", className)} style={{ height }}>
      <div
        className="absolute inset-0 overflow-hidden rounded-full bg-white/[0.06]"
        aria-hidden="true"
      >
        <div
          className={cn(
            "h-full bg-gradient-to-r [box-shadow:0_0_12px_rgba(166,225,207,0.45)]",
            TONE_FROM[tone],
          )}
          style={{ width: `${clamped * 100}%` }}
        />
      </div>
      {thresholds.map((t) => (
        <div
          key={t}
          aria-hidden="true"
          className="absolute -top-[3px] -bottom-[3px] w-px bg-white/30"
          style={{ left: `${Math.max(0, Math.min(1, t)) * 100}%` }}
        />
      ))}
    </div>
  );
}
