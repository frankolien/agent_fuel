import type { LiveStatus } from "@/lib/api/live";

type LiveBadgeProps = {
  status: LiveStatus;
};

const META: Record<LiveStatus, { label: string; tone: string; pulse: boolean }> = {
  connecting: { label: "Connecting…", tone: "text-muted", pulse: false },
  open: { label: "Live", tone: "text-mint", pulse: true },
  reconnecting: { label: "Reconnecting…", tone: "text-[#E6B86F]", pulse: false },
  closed: { label: "Offline", tone: "text-muted", pulse: false },
};

export function LiveBadge({ status }: LiveBadgeProps) {
  const meta = META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] bg-surface-2 px-2.5 py-1 font-mono text-[10.5px] tracking-[0.06em] uppercase ${meta.tone}`}
    >
      <span
        className={
          "h-1.5 w-1.5 rounded-full bg-current " +
          (meta.pulse
            ? "[box-shadow:0_0_8px_var(--color-mint-glow)] animate-pulse"
            : "opacity-60")
        }
      />
      {meta.label}
    </span>
  );
}
