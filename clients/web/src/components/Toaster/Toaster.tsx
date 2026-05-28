// Bottom-right stack of dismissible cards. Subscribes to the toast store and
// re-renders on push/dismiss. Pure presentation — the store in `lib/toast.ts`
// owns all state and timers.

import { dismiss, useToasts, type Toast } from "@/lib/toast";

export function Toaster() {
  const toasts = useToasts();
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      // Above modals (z-40 sidebar drawer, z-20 nav dropdown). Pointer-events
      // disabled on the container so empty space stays clickable, re-enabled
      // on individual toasts so their close button works.
      className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  const tone = TONE[toast.kind];
  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      className={
        "pointer-events-auto grid w-full max-w-[380px] grid-cols-[auto_1fr_auto] items-start gap-2.5 rounded-[10px] border bg-[#15171a] px-3 py-2.5 text-[12.5px] shadow-[0_12px_32px_-8px_rgba(0,0,0,0.7)] " +
        tone.border
      }
    >
      <span className={"mt-[3px] h-2 w-2 rounded-full " + tone.dot} aria-hidden="true" />
      <div className="min-w-0">
        <div className={"font-medium " + tone.fg}>{toast.message}</div>
        {toast.detail ? (
          <div className="mt-0.5 font-mono text-[11px] break-all text-muted">{toast.detail}</div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        aria-label="Dismiss"
        className="-mr-1 grid h-5 w-5 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 2 L8 8 M8 2 L2 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

const TONE = {
  success: {
    border: "border-mint/40",
    dot: "bg-mint",
    fg: "text-fg",
  },
  error: {
    border: "border-[#E08577]/50",
    dot: "bg-[#E08577]",
    fg: "text-fg",
  },
  info: {
    border: "border-white/[0.12]",
    dot: "bg-fg-2",
    fg: "text-fg",
  },
} as const;
