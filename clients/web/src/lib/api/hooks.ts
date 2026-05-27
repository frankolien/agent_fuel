// Typed wrappers around `api.*` calls. Screens consume these one-liners so the
// query key + fetcher pairing can't drift over time.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type {
  Agent,
  EventRow,
  ReputationLookup,
  ScorePoint,
  Vault,
} from "@/types/api";
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
  return useQuery({
    queryKey: queryKeys.vaults(),
    queryFn: () => api.listVaults(),
  });
}

export function useVaultQuery(pubkey: string | undefined): UseQueryResult<Vault> {
  return useQuery({
    queryKey: pubkey ? queryKeys.vault(pubkey) : ["vault", "missing"],
    queryFn: () => api.getVault(pubkey!),
    enabled: !!pubkey,
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
