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
  Vault,
} from "@/types/api";
import { useAuth } from "@/app/auth";
import { HttpError } from "@/lib/http";
import { readVaultFromChain, readVaultsFromChainByOwner } from "@/lib/owner-actions";
import { api } from "./client";
import { queryKeys } from "./keys";

export function useAgentsQuery(): UseQueryResult<Agent[]> {
  return useQuery({
    queryKey: queryKeys.agents(),
    queryFn: () => api.listAgents(),
  });
}

export function useAgentQuery(pubkey: string | undefined): UseQueryResult<Agent> {
  return useQuery({
    queryKey: pubkey ? queryKeys.agent(pubkey) : ["agent", "missing"],
    queryFn: () => api.getAgent(pubkey!),
    enabled: !!pubkey,
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

export function useReputationQuery(
  agent: string | undefined,
): UseQueryResult<ReputationLookup> {
  return useQuery({
    queryKey: agent ? queryKeys.reputation(agent) : ["reputation", "missing"],
    queryFn: () => api.reputation(agent!),
    enabled: !!agent,
  });
}
