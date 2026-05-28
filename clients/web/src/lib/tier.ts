// Reputation tier mapping used by ScoreBadge plus a few KPI labels.
// Extracted from ScoreBadge so the file can fast-refresh cleanly — Vite's
// HMR drops to a full reload on any file that exports both a component and
// a non-component value.

export type Tier = { label: string; tone: string };

/** Bucket a 0-1000 reputation score into a tier. `null` and `0` both render
 *  as UNSCORED — the mirror table defaults score to 0 before
 *  `compute_score` ever runs, so visually they're the same "no signal yet". */
export function tierFor(score: number | null): Tier {
  if (score === null || score === 0) return { label: "UNSCORED", tone: "text-muted" };
  if (score >= 900) return { label: "ELITE", tone: "text-mint" };
  if (score >= 750) return { label: "TRUSTED", tone: "text-mint-soft" };
  if (score >= 500) return { label: "STANDARD", tone: "text-fg-2" };
  if (score >= 250) return { label: "WATCHED", tone: "text-[#E6B86F]" };
  return { label: "AT RISK", tone: "text-[#E08577]" };
}
