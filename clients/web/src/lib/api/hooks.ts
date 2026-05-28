// Typed wrappers around `api.*` calls. Screens consume these one-liners so the
// query key + fetcher pairing can't drift over time.

import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import type {
  Agent,
  BackfillReport,
  EventRow,
  ReputationLookup,
  ScorePoint,
  Service,
  Vault,
} from "@/types/api";
import { useAuth } from "@/app/auth";
import { HttpError } from "@/lib/http";
import { toast } from "@/lib/toast";
import {
  readAgentFromChain,
  readAgentsFromChainByOwner,
  readServicesFromChain,
  readVaultFromChain,
  readVaultsFromChainByAgent,
  readVaultsFromChainByOwner,
} from "@/lib/owner-actions";
import { api } from "./client";
import { queryKeys } from "./keys";

export function useAgentsQuery(): UseQueryResult<Agent[]> {
  const { connection } = useConnection();
  const { walletPubkey } = useAuth();
  return useQuery({
    // Scope by wallet so the cache resets when the user switches owners.
    queryKey: walletPubkey ? [...queryKeys.agents(), walletPubkey] : queryKeys.agents(),
    queryFn: async () => {
      // Backend may return null / non-array on empty or transient errors —
      // coerce so every consumer can safely .map/.length without guards.
      const fromBackend = toArray<Agent>(await api.listAgents());
      if (!walletPubkey) return fromBackend;
      // If the backend already has indexed agents, prefer that (it has the
      // computed reputation + indexed activity hooks). Otherwise scan the
      // chain for AgentProfile accounts owned by the connected wallet.
      if (fromBackend.length > 0) return fromBackend;
      try {
        return toArray<Agent>(
          await readAgentsFromChainByOwner(connection, new PublicKey(walletPubkey)),
        );
      } catch (err) {
        console.warn("agents chain fallback failed", err);
        return fromBackend; // empty
      }
    },
    placeholderData: (prev) => prev,
  });
}

// React Query types its data as `T` but we sometimes get `null` from a 204 or
// a shape mismatch from an older backend. Centralising this here means screens
// don't need to repeat `Array.isArray` checks before every map.
function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function useAgentQuery(pubkey: string | undefined): UseQueryResult<Agent> {
  const { connection } = useConnection();
  return useQuery({
    queryKey: pubkey ? queryKeys.agent(pubkey) : ["agent", "missing"],
    queryFn: async () => {
      try {
        return await api.getAgent(pubkey!);
      } catch (err) {
        // Indexer gap fallback — same pattern as useVaultQuery.
        if (err instanceof HttpError && err.status === 404) {
          const onChain = await readAgentFromChain(connection, new PublicKey(pubkey!));
          if (onChain) return onChain;
        }
        throw err;
      }
    },
    enabled: !!pubkey,
    placeholderData: (prev) => prev,
  });
}

export function useAgentActivityQuery(
  pubkey: string | undefined,
  before?: number,
): UseQueryResult<EventRow[]> {
  return useQuery({
    queryKey: pubkey ? [...queryKeys.agentActivity(pubkey), before ?? "head"] : ["agent-activity", "missing"],
    queryFn: async () => {
      try {
        return await api.agentActivity(pubkey!, before === undefined ? {} : { before_slot: before });
      } catch (err) {
        // Agent exists on-chain but the indexer never saw an AgentInitialized
        // event for it (created during a broken-webhook window). Treat as
        // "no history yet" so the page renders cleanly instead of erroring,
        // and so React Query won't keep retrying a permanent 404.
        if (err instanceof HttpError && err.status === 404) return [] as EventRow[];
        throw err;
      }
    },
    enabled: !!pubkey,
    retry: (count, err) => {
      if (err instanceof HttpError && err.status === 404) return false;
      return count < 2;
    },
  });
}

export function useAgentVaultsQuery(
  pubkey: string | undefined,
): UseQueryResult<Vault[]> {
  const { connection } = useConnection();
  return useQuery({
    queryKey: pubkey ? queryKeys.agentVaults(pubkey) : ["agent-vaults", "missing"],
    queryFn: async () => {
      // No backend endpoint yet for "vaults by agent" — read chain directly.
      // Cheap (1 getProgramAccounts + N fetches; users rarely have many vaults).
      return toArray<Vault>(
        await readVaultsFromChainByAgent(connection, new PublicKey(pubkey!)),
      );
    },
    enabled: !!pubkey,
    placeholderData: (prev) => prev,
  });
}

export function useAgentScoreHistoryQuery(
  pubkey: string | undefined,
): UseQueryResult<ScorePoint[]> {
  return useQuery({
    queryKey: pubkey ? queryKeys.agentScoreHistory(pubkey) : ["agent-score-history", "missing"],
    queryFn: async () => {
      try {
        return await api.agentScoreHistory(pubkey!);
      } catch (err) {
        // Same "not indexed yet" path as agent activity — score history is
        // gated on the agents row existing.
        if (err instanceof HttpError && err.status === 404) return [] as ScorePoint[];
        throw err;
      }
    },
    enabled: !!pubkey,
    retry: (count, err) => {
      if (err instanceof HttpError && err.status === 404) return false;
      return count < 2;
    },
  });
}

export function useVaultsQuery(): UseQueryResult<Vault[]> {
  const { connection } = useConnection();
  const { walletPubkey } = useAuth();
  return useQuery({
    // Scope by wallet so switching owners doesn't show a stale list.
    queryKey: walletPubkey ? [...queryKeys.vaults(), walletPubkey] : queryKeys.vaults(),
    queryFn: async () => {
      const fromBackend = toArray<Vault>(await api.listVaults());
      // If the indexer already knows vaults for this user, use that — it has
      // history + activity hooks the chain doesn't. If the list is empty (or
      // missing this user's vaults entirely), fall back to scanning the chain
      // for any vaults owned by the connected wallet so the user actually
      // sees what they own.
      if (!walletPubkey) return fromBackend;
      if (fromBackend.length > 0) return fromBackend;
      try {
        return toArray<Vault>(
          await readVaultsFromChainByOwner(connection, new PublicKey(walletPubkey)),
        );
      } catch (err) {
        console.warn("vaults chain fallback failed", err);
        return fromBackend; // empty
      }
    },
    placeholderData: (prev) => prev,
  });
}

export function useVaultQuery(pubkey: string | undefined): UseQueryResult<Vault> {
  const { connection } = useConnection();
  return useQuery({
    queryKey: pubkey ? queryKeys.vault(pubkey) : ["vault", "missing"],
    queryFn: async () => {
      try {
        return await api.getVault(pubkey!);
      } catch (err) {
        // Indexer gap: vault exists on chain but the backend never saw a
        // creation event (e.g. created before the backend went live, or the
        // Helius webhook isn't wired up). Fall back to reading the vault
        // state directly from chain — the UI is identical either way, and
        // the backend will catch up on the next observed event.
        if (err instanceof HttpError && err.status === 404) {
          try {
            const onChain = await readVaultFromChain(connection, new PublicKey(pubkey!));
            if (onChain) return onChain;
          } catch (chainErr) {
            // Chain read can fail transiently (RPC throttling, network blip).
            // Log so we can diagnose, but rethrow the original 404 so the
            // caller's not-found handling stays consistent.
            console.warn("vault chain fallback failed", chainErr);
          }
        }
        throw err;
      }
    },
    enabled: !!pubkey,
    // Keep showing previous data while refetching after navigation — prevents
    // the UI from flashing "Vault not found" if a stale-time refetch hiccups.
    placeholderData: (prev) => prev,
  });
}

export function useVaultActivityQuery(
  pubkey: string | undefined,
  before?: number,
): UseQueryResult<EventRow[]> {
  return useQuery({
    queryKey: pubkey ? [...queryKeys.vaultActivity(pubkey), before ?? "head"] : ["vault-activity", "missing"],
    queryFn: async () => {
      try {
        return await api.vaultActivity(pubkey!, before === undefined ? {} : { before_slot: before });
      } catch (err) {
        // Same indexer-gap path as agent activity — unindexed vault → 404.
        if (err instanceof HttpError && err.status === 404) return [] as EventRow[];
        throw err;
      }
    },
    enabled: !!pubkey,
    retry: (count, err) => {
      if (err instanceof HttpError && err.status === 404) return false;
      return count < 2;
    },
  });
}

export function useServicesQuery(): UseQueryResult<Service[]> {
  const { connection } = useConnection();
  return useQuery({
    queryKey: ["services", "list"],
    queryFn: async () => {
      // Backend mirrors the on-chain registry from indexed events — fast and
      // public. We also fall back to a chain scan if the backend errors *or*
      // returns empty, so a slow Helius webhook doesn't hide a just-registered
      // service. Chain is source of truth; backend is the cheap read view.
      try {
        const rows = toArray<unknown>(await api.listServices());
        if (rows.length > 0) return rows.map(normalizeBackendService);
      } catch (err) {
        console.warn("backend services list failed; falling back to chain", err);
      }
      return toArray<Service>(await readServicesFromChain(connection));
    },
    placeholderData: (prev) => prev,
  });
}

const CATEGORY_FROM_TAG: Record<number, Service["category"]> = {
  0: "DataFeed",
  1: "Compute",
  2: "Swap",
  3: "Rpc",
  4: "Other",
};

// Backend's ServiceRow uses different field names + an int category tag.
// Reshape it to the TS `Service` shape consumers expect.
function normalizeBackendService(row: unknown): Service {
  const r = row as Record<string, unknown>;
  const catRaw = r["category"];
  const category =
    typeof catRaw === "number"
      ? (CATEGORY_FROM_TAG[catRaw] ?? "Other")
      : (catRaw as Service["category"]) || "Other";
  return {
    pubkey: String(r["pubkey"] ?? ""),
    // The backend doesn't expose the registry PDA; derive on the client when
    // needed via serviceRegistryPda(servicePubkey). Empty string here marks
    // "fetch from backend" so the UI can't accidentally treat it as a real PDA.
    registry: "",
    name: String(r["name"] ?? ""),
    category,
    total_agents_served: Number(r["total_agents_served"] ?? 0),
    total_volume_received_usdc: Number(r["total_volume_received_usdc"] ?? 0),
    active: Boolean(r["active"] ?? false),
    first_active_slot: Number(r["init_slot"] ?? r["first_active_slot"] ?? 0),
    last_active_slot: Number(r["last_active_slot"] ?? 0),
  };
}

/** Triggers an owner-gated server-side replay of the agent's on-chain history.
 *  On success, invalidates everything keyed by the agent so the just-indexed
 *  events show up immediately without a full page reload. */
export function useBackfillAgent(
  pubkey: string | undefined,
): UseMutationResult<BackfillReport, Error, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!pubkey) throw new Error("pubkey required");
      return api.backfillAgent(pubkey);
    },
    onSuccess: (report) => {
      if (!pubkey) return;
      // The detail row + score history + activity all derive from the same
      // event stream that backfill just populated. Force-fresh them all.
      qc.invalidateQueries({ queryKey: queryKeys.agent(pubkey) });
      qc.invalidateQueries({ queryKey: queryKeys.agentActivity(pubkey) });
      qc.invalidateQueries({ queryKey: queryKeys.agentScoreHistory(pubkey) });
      qc.invalidateQueries({ queryKey: queryKeys.agents() });
      // Distinguish "just brought this agent online" from "nothing new" — the
      // second case (events_inserted === 0) is normal on a replay and shouldn't
      // claim credit for ingesting anything.
      if (report.events_inserted > 0) {
        toast.success(`Backfilled ${report.events_inserted} event${report.events_inserted === 1 ? "" : "s"}`, {
          detail: `${report.signatures_scanned} signatures scanned · ${report.transactions_parsed} parsed`,
        });
      } else {
        toast.info("Already up to date", {
          detail: `${report.signatures_scanned} signatures scanned, nothing new to index`,
        });
      }
    },
    onError: (err) => {
      toast.fromError(err, "Backfill failed");
    },
  });
}

/** Vault analogue of `useBackfillAgent`. Replays VaultCreated + every
 *  subsequent vault event for this PDA, then refreshes the dependent caches. */
export function useBackfillVault(
  pubkey: string | undefined,
): UseMutationResult<BackfillReport, Error, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!pubkey) throw new Error("pubkey required");
      return api.backfillVault(pubkey);
    },
    onSuccess: (report) => {
      if (!pubkey) return;
      qc.invalidateQueries({ queryKey: queryKeys.vault(pubkey) });
      qc.invalidateQueries({ queryKey: queryKeys.vaultActivity(pubkey) });
      qc.invalidateQueries({ queryKey: queryKeys.vaults() });
      if (report.events_inserted > 0) {
        toast.success(`Backfilled ${report.events_inserted} event${report.events_inserted === 1 ? "" : "s"}`, {
          detail: `${report.signatures_scanned} signatures scanned · ${report.transactions_parsed} parsed`,
        });
      } else {
        toast.info("Already up to date", {
          detail: `${report.signatures_scanned} signatures scanned, nothing new to index`,
        });
      }
    },
    onError: (err) => {
      toast.fromError(err, "Backfill failed");
    },
  });
}

export function useReputationQuery(
  agent: string | undefined,
): UseQueryResult<ReputationLookup> {
  return useQuery({
    queryKey: agent ? queryKeys.reputation(agent) : ["reputation", "missing"],
    queryFn: () => api.reputation(agent!),
    enabled: !!agent,
  });
}
