import { SectionHeading } from "@/components/SectionHeading/SectionHeading";
import { FEATURES } from "../content";

export function Protocol() {
  return (
    <section id="protocol" className="pt-[120px]">
      <SectionHeading
        eyebrow="The Protocol"
        title={
          <>
            Three primitives every agent <em>needs</em>.
          </>
        }
        lede="Two Anchor programs on Solana, an Axum indexer, and a TypeScript SDK that drops into any agent framework."
      />
      <div className="mx-auto grid max-w-[var(--container-shell)] grid-cols-1 gap-3.5 px-[var(--pad)] md:grid-cols-3">
        {FEATURES.map((feat) => (
          <article
            key={feat.id}
            id={feat.id}
            className="grid min-h-[360px] grid-rows-[auto_auto_auto_1fr] gap-4 rounded-[22px] border border-[var(--color-line)] bg-surface p-7"
          >
            <div className="font-mono text-xs tracking-[0.16em] text-muted-2">{feat.num}</div>
            <h3 className="m-0 text-[26px] leading-[1.15] font-medium tracking-[-0.02em]">
              {feat.titleHtml.lead}
              <em className="text-mint not-italic">{feat.titleHtml.em}</em>
              {feat.titleHtml.tail}
            </h3>
            <p className="m-0 text-[14.5px] text-muted">{feat.body}</p>
            <FeatureArt id={feat.id} />
          </article>
        ))}
      </div>
    </section>
  );
}

function FeatureArt({ id }: { id: string }) {
  return (
    <div
      aria-hidden="true"
      className="mt-auto flex h-[120px] items-center border-t border-[var(--color-line)] pt-[18px] text-mint"
    >
      {id === "reputation" ? <ReputationArt /> : null}
      {id === "vaults" ? <VaultArt /> : null}
      {id === "policies" ? <PoliciesArt /> : null}
    </div>
  );
}

function ReputationArt() {
  return (
    <svg viewBox="0 0 240 80" width="100%" height="80" preserveAspectRatio="none">
      <path
        d="M0 60 C 40 56, 60 40, 100 32 S 160 18, 200 14 L 240 10"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M0 60 C 40 56, 60 40, 100 32 S 160 18, 200 14 L 240 10 L 240 80 L 0 80 Z"
        fill="currentColor"
        fillOpacity="0.1"
      />
      <circle cx="240" cy="10" r="3" fill="currentColor" />
    </svg>
  );
}

function VaultArt() {
  return (
    <svg viewBox="0 0 240 80" width="100%" height="80" preserveAspectRatio="none">
      <rect x="0" y="40" width="240" height="14" rx="7" fill="currentColor" fillOpacity="0.1" />
      <rect x="0" y="40" width="156" height="14" rx="7" fill="currentColor" />
      <line x1="120" y1="34" x2="120" y2="60" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function PoliciesArt() {
  const bars = [
    { x: 0, y: 46, h: 14, o: 0.9 },
    { x: 32, y: 40, h: 20, o: 0.7 },
    { x: 64, y: 32, h: 28, o: 0.55 },
    { x: 96, y: 36, h: 24, o: 0.4 },
    { x: 128, y: 42, h: 18, o: 0.3 },
    { x: 160, y: 50, h: 10, o: 0.22 },
    { x: 192, y: 54, h: 6, o: 0.18 },
  ];
  return (
    <svg viewBox="0 0 240 80" width="100%" height="80" preserveAspectRatio="none">
      <g fill="currentColor">
        {bars.map((b) => (
          <rect key={b.x} x={b.x} y={b.y} width={24} height={b.h} rx={2} fillOpacity={b.o} />
        ))}
      </g>
    </svg>
  );
}
