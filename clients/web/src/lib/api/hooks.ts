// Typed wrappers around `api.*` calls. Screens consume these one-liners so the
// query key + fetcher pairing can't drift over time.

import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type {
  Agent,
  EventRow,
  ReputationLookup,
  ScorePoint,
  Service,
  Vault,
} from "@/types/api";
import { useAuth } from "@/app/auth";
import { HttpError } from "@/lib/http";
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
      const fromBackend = await api.listAgents();
      if (!walletPubkey) return fromBackend;
      // If the backend already has indexed agents, prefer that (it has the
      // computed reputation + indexed activity hooks). Otherwise scan the
      // chain for AgentProfile accounts owned by the connected wallet.
      if (fromBackend.length > 0) return fromBackend;
      try {
        return await readAgentsFromChainByOwner(connection, new PublicKey(walletPubkey));
      } catch (err) {
        console.warn("agents chain fallback failed", err);
        return fromBackend; // empty
      }
    },
    placeholderData: (prev) => prev,
  });
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
    queryFn: () => api.agentActivity(pubkey!, before === undefined ? {} : { before_slot: before }),
    enabled: !!pubkey,
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
      return readVaultsFromChainByAgent(connection, new PublicKey(pubkey!));
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
    queryFn: () => api.agentScoreHistory(pubkey!),
    enabled: !!pubkey,
  });
}

export function useVaultsQuery(): UseQueryResult<Vault[]> {
  const { connection } = useConnection();
  const { walletPubkey } = useAuth();
  return useQuery({
    // Scope by wallet so switching owners doesn't show a stale list.
    queryKey: walletPubkey ? [...queryKeys.vaults(), walletPubkey] : queryKeys.vaults(),
    queryFn: async () => {
      const fromBackend = await api.listVaults();
      // If the indexer already knows vaults for this user, use that — it has
      // history + activity hooks the chain doesn't. If the list is empty (or
      // missing this user's vaults entirely), fall back to scanning the chain
      // for any vaults owned by the connected wallet so the user actually
      // sees what they own.
      if (!walletPubkey) return fromBackend;
      if (fromBackend.length > 0) return fromBackend;
      try {
        return await readVaultsFromChainByOwner(connection, new PublicKey(walletPubkey));
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
    queryFn: () => api.vaultActivity(pubkey!, before === undefined ? {} : { before_slot: before }),
    enabled: !!pubkey,
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
        const rows = await api.listServices();
        if (rows.length > 0) return rows.map(normalizeBackendService);
      } catch (err) {
        console.warn("backend services list failed; falling back to chain", err);
      }
      return readServicesFromChain(connection);
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

export function useReputationQuery(
  agent: string | undefined,
): UseQueryResult<ReputationLookup> {
  return useQuery({
    queryKey: agent ? queryKeys.reputation(agent) : ["reputation", "missing"],
    queryFn: () => api.reputation(agent!),
    enabled: !!agent,
  });
}
