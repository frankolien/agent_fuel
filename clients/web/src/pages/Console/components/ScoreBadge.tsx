// Tiered 0-1000 reputation label. Used in agent cards + detail header.
// Treats `score === 0` the same as null: the mirror table defaults score to 0
// before `compute_score` ever runs, so visually they're the same "no signal".

import { tierFor } from "@/lib/tier";

type ScoreBadgeProps = {
  score: number | null;
};

export function ScoreBadge({ score }: ScoreBadgeProps) {
  const { label, tone } = tierFor(score);
  return (
    <span className={`font-mono text-[10.5px] tracking-[0.16em] uppercase ${tone}`}>
      {label}
    </span>
  );
}
