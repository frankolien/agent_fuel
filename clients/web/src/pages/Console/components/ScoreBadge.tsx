// Tiered 0-1000 reputation label. Used in agent cards + detail header.

type ScoreBadgeProps = {
  score: number | null;
};

export function tierFor(score: number | null): { label: string; tone: string } {
  if (score === null) return { label: "UNSCORED", tone: "text-muted" };
  if (score >= 900) return { label: "ELITE", tone: "text-mint" };
  if (score >= 750) return { label: "TRUSTED", tone: "text-mint-soft" };
  if (score >= 500) return { label: "STANDARD", tone: "text-fg-2" };
  if (score >= 250) return { label: "WATCHED", tone: "text-[#E6B86F]" };
  return { label: "AT RISK", tone: "text-[#E08577]" };
}

export function ScoreBadge({ score }: ScoreBadgeProps) {
  const { label, tone } = tierFor(score);
  return (
    <span className={`font-mono text-[10.5px] tracking-[0.16em] uppercase ${tone}`}>
      {label}
    </span>
  );
}
