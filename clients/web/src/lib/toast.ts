// Tiny global toast store. No context provider needed — toasts can fire from
// anywhere (mutations, query error handlers, ad-hoc) and the <Toaster /> at
// the root subscribes to render them.
//
// API mirrors `react-hot-toast` enough that consumers stay readable:
//   toast.success("backfilled 3 events")
//   toast.error("backend rejected: 404")
//   toast.info("nothing to do")

import { useSyncExternalStore } from "react";
import { errorDetail, errorMessage } from "@/lib/error";

export type ToastKind = "success" | "error" | "info";

export type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
  /** Optional extra line (small, monospace) for technical detail like "404 / api.agentfuel.online". */
  detail?: string;
  /** Auto-dismiss in ms. 0 = sticky (user must close). Errors are sticky by default so they're not missed. */
  duration: number;
  createdAt: number;
};

type Listener = () => void;

const DEFAULT_DURATION: Record<ToastKind, number> = {
  success: 3500,
  info: 4000,
  // Sticky so the user actually reads it — they can dismiss with the close
  // button. Same convention as Linear, Vercel, etc.
  error: 0,
};

let nextId = 1;
let toasts: Toast[] = [];
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l();
}

function add(kind: ToastKind, message: string, options: { detail?: string; duration?: number } = {}): number {
  const id = nextId++;
  const duration = options.duration ?? DEFAULT_DURATION[kind];
  // Spread only when defined so we respect `exactOptionalPropertyTypes` —
  // never assign `undefined` to a property typed as `string | undefined`.
  const t: Toast = {
    id,
    kind,
    message,
    duration,
    createdAt: Date.now(),
    ...(options.detail !== undefined ? { detail: options.detail } : {}),
  };
  toasts = [...toasts, t];
  emit();
  if (duration > 0) {
    setTimeout(() => dismiss(id), duration);
  }
  return id;
}

export function dismiss(id: number): void {
  const before = toasts.length;
  toasts = toasts.filter((t) => t.id !== id);
  if (toasts.length !== before) emit();
}

export const toast = {
  success(message: string, options?: { detail?: string; duration?: number }): number {
    return add("success", message, options ?? {});
  },
  error(message: string, options?: { detail?: string; duration?: number }): number {
    return add("error", message, options ?? {});
  },
  info(message: string, options?: { detail?: string; duration?: number }): number {
    return add("info", message, options ?? {});
  },
  /** Convenience: extract a user-friendly message from an error or HttpError.
   *  Delegates to `lib/error.ts` so the inline list-screen ErrorState and the
   *  toast surface format identical messages — one place to tune copy. */
  fromError(err: unknown, fallback = "Something went wrong"): number {
    const message = errorMessage(err) || fallback;
    const detail = errorDetail(err);
    return add("error", message, detail !== undefined ? { detail } : {});
  },
  dismiss,
};

/** Subscribe to the toast list. The renderer uses this via useSyncExternalStore. */
export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): Toast[] {
  return toasts;
}

