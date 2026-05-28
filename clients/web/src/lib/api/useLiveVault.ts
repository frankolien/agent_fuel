// Live-event subscription scoped to a single vault. Mirrors `useLiveAgent`
// in shape so VaultDetail can read .status / .recent identically.
//
// Previously the vault screen reused `useLiveAgent` against the vault's
// agent pubkey, but the backend only broadcast events with a top-level
// `agent` field on that channel — so Deposited, Claimed, VaultFrozen,
// VaultUnfrozen, PolicyUpdated, and Withdrawn (all vault-only payloads)
// never reached the UI. This hook subscribes to /ws/vaults/:pk where the
// backend now fans out every vault-touching event.

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { EventRow, LiveEventFrame } from "@/types/api";
import { subscribeVault, type LiveStatus } from "./live";
import { queryKeys } from "./keys";

const MAX_BUFFERED_ACTIVITY = 200;

type UseLiveVault = {
  status: LiveStatus;
  recent: ReadonlyArray<LiveEventFrame>;
};

export function useLiveVault(pubkey: string | undefined): UseLiveVault {
  const qc = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>("closed");
  const recentRef = useRef<LiveEventFrame[]>([]);
  const [, force] = useState(0);

  useEffect(() => {
    if (!pubkey) return;
    recentRef.current = [];

    const sub = subscribeVault(
      pubkey,
      (frame) => {
        // Merge into the cached activity list so the screen updates without
        // a round-trip. Same dedupe trick as useLiveAgent — reconnects can
        // re-push frames that already landed via the REST page.
        qc.setQueriesData<EventRow[]>(
          { queryKey: queryKeys.vaultActivity(pubkey) },
          (prev) => mergeEvent(prev, frame),
        );
        // Top-line vault state (balance, frozen, last_active_slot) changes
        // on most of these events — mark stale so the next render refetches.
        qc.invalidateQueries({ queryKey: queryKeys.vault(pubkey), refetchType: "none" });

        recentRef.current = [frame, ...recentRef.current].slice(0, 40);
        force((n) => n + 1);
      },
      setStatus,
    );

    return () => sub.unsubscribe();
  }, [pubkey, qc]);

  return { status, recent: recentRef.current };
}

function mergeEvent(prev: EventRow[] | undefined, frame: LiveEventFrame): EventRow[] {
  const event: EventRow = {
    signature: frame.signature,
    log_index: frame.log_index,
    slot: frame.slot,
    program_id: frame.program_id,
    event_name: frame.event_name,
    payload: frame.payload,
    received_at: new Date().toISOString(),
  };
  if (!prev) return [event];
  const dup = prev.some((it) => it.signature === event.signature && it.log_index === event.log_index);
  if (dup) return prev;
  return [event, ...prev].slice(0, MAX_BUFFERED_ACTIVITY);
}
