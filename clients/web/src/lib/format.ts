// Shared formatters. Used across console screens so dollars / counts / timestamps
// render identically no matter which card you're looking at.

const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usdPreciseFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

const usdCompactFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const intFmt = new Intl.NumberFormat("en-US");
const intCompactFmt = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** USDC counters are stored as 6-decimal micro-USDC on chain. */
export function microUsdcToDollars(amount: number): number {
  return amount / 1_000_000;
}

/** $1,234.56 — for human-scale amounts. Sub-dollar values get 4 decimals. */
export function formatUsdc(microUsdc: number): string {
  const dollars = microUsdcToDollars(microUsdc);
  if (dollars > 0 && dollars < 1) return usdPreciseFmt.format(dollars);
  return usdFmt.format(dollars);
}

/** $1.2K, $14.2M — for headline KPIs where width matters. */
export function formatUsdcCompact(microUsdc: number): string {
  return usdCompactFmt.format(microUsdcToDollars(microUsdc));
}

export function formatNumber(n: number): string {
  return intFmt.format(n);
}

export function formatNumberCompact(n: number): string {
  return intCompactFmt.format(n);
}

/** Drops the middle of a long pubkey: "AtL5…m7Wm". */
export function shortPubkey(pubkey: string, edge = 4): string {
  if (pubkey.length <= edge * 2 + 1) return pubkey;
  return `${pubkey.slice(0, edge)}…${pubkey.slice(-edge)}`;
}

/**
 * Slot → "~2m ago" style label. Solana is ~400ms/slot, so 1m ≈ 150 slots.
 * Uses the current slot reference passed in (the live ticker provides one
 * eventually; for now callers pass the most-recent known slot).
 */
export function formatSlotAgo(slot: number, referenceSlot: number): string {
  const slotsAgo = Math.max(0, referenceSlot - slot);
  const seconds = Math.round(slotsAgo * 0.4);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/** RFC3339 → "May 27, 2026". */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
