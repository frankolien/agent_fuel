import type { EventRow } from "@/types/api";
import { formatNumber, formatSlotAgo, formatUsdc, shortPubkey } from "@/lib/format";

type ActivityRowProps = {
  event: EventRow;
  referenceSlot: number;
};

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

// Surfaces the headline (verb + counterparty), an amount when present, and
// the truncated signature. Falls back to the raw event_name for events we
// don't have bespoke styling for yet (e.g. AgentInitialized, PolicyUpdated).
export function ActivityRow({ event, referenceSlot }: ActivityRowProps) {
  const amountMicro = asNumber(event.payload["amount_usdc"]);
  const service = asString(event.payload["service"]);
  const newScore = asNumber(event.payload["score"]);

  const verb = labelFor(event.event_name);
  const counterparty =
    service
      ? shortPubkey(service, 4)
      : event.event_name === "ScoreComputed" && newScore !== null
        ? `score → ${formatNumber(newScore)}`
        : null;

  return (
    <div className="grid grid-cols-[56px_1fr_auto] items-center gap-2.5 border-b border-white/[0.05] py-2 last:border-b-0">
      <div className="font-mono text-[11px] text-muted">{formatSlotAgo(event.slot, referenceSlot)}</div>
      <div className="grid min-w-0 gap-0.5">
        <div className="flex min-w-0 items-baseline gap-2 text-[13px]">
          <span className={`shrink-0 font-mono text-[11px] tracking-[0.04em] uppercase ${toneFor(event.event_name)}`}>
            {verb}
          </span>
          {counterparty ? (
            <span className="truncate font-mono text-[12px] text-fg-2">{counterparty}</span>
          ) : null}
        </div>
        <div className="truncate font-mono text-[10.5px] text-muted">{shortPubkey(event.signature, 4)}</div>
      </div>
      <div className="shrink-0 font-mono text-[12.5px] text-fg tabular-nums">
        {amountMicro !== null ? formatUsdc(amountMicro) : ""}
      </div>
    </div>
  );
}

function labelFor(eventName: string): string {
  switch (eventName) {
    case "Spent":
      return "spend";
    case "Claimed":
      return "claim";
    case "Deposited":
      return "deposit";
    case "ScoreComputed":
      return "score";
    case "VaultFrozen":
      return "freeze";
    case "VaultUnfrozen":
      return "unfreeze";
    case "AgentInitialized":
      return "init";
    default:
      return eventName.toLowerCase();
  }
}

function toneFor(eventName: string): string {
  switch (eventName) {
    case "Spent":
      return "text-mint";
    case "Claimed":
      return "text-mint-soft";
    case "ScoreComputed":
      return "text-fg-2";
    case "VaultFrozen":
      return "text-[#E08577]";
    default:
      return "text-muted";
  }
}
