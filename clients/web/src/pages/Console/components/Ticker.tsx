import type { LiveEventFrame } from "@/types/api";
import { formatUsdc, shortPubkey } from "@/lib/format";

type TickerProps = {
  items: ReadonlyArray<LiveEventFrame>;
};

// Horizontal scrolling marquee for the topbar. Duplicates the items inline so
// the keyframe can translate -50% without exposing a gap at the loop point.
export function Ticker({ items }: TickerProps) {
  if (items.length === 0) {
    return (
      <div className="font-mono text-[11.5px] text-muted">
        <span className="animate-pulse">waiting for activity…</span>
      </div>
    );
  }
  const doubled = [...items, ...items];
  return (
    <div className="ticker-mask relative h-7 self-center overflow-hidden">
      <div className="ticker-strip flex items-center gap-5 whitespace-nowrap">
        {doubled.map((frame, idx) => (
          <TickerItem key={`${idx}:${frame.signature}`} frame={frame} />
        ))}
      </div>
    </div>
  );
}

function TickerItem({ frame }: { frame: LiveEventFrame }) {
  const verb = labelFor(frame.event_name);
  const service = typeof frame.payload["service"] === "string" ? frame.payload["service"] : null;
  const amountMicro =
    typeof frame.payload["amount_usdc"] === "number" ? frame.payload["amount_usdc"] : null;
  const score = typeof frame.payload["score"] === "number" ? frame.payload["score"] : null;
  const agent = typeof frame.payload["agent"] === "string" ? frame.payload["agent"] : "";

  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px]">
      <span className="text-fg">{shortPubkey(agent)}</span>
      <span className="text-muted">{verb}</span>
      {service ? <span className="text-fg-2">{service}</span> : null}
      {amountMicro !== null ? <span className="text-mint">{formatUsdc(amountMicro)}</span> : null}
      {score !== null ? <span className="text-fg">→ {score}</span> : null}
      <span className="text-muted">·</span>
    </span>
  );
}

function labelFor(eventName: string): string {
  switch (eventName) {
    case "Spent": return "spend →";
    case "Claimed": return "claim ←";
    case "Deposited": return "deposit";
    case "ScoreComputed": return "score";
    case "VaultFrozen": return "freeze";
    default: return eventName.toLowerCase();
  }
}
