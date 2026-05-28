// Typed API client. Every screen calls these — never `fetch` directly — so
// auth headers and error decoding live in one place.

import { request } from "../http";
import type {
  Agent,
  EventRow,
  ReputationLookup,
  ScorePoint,
  Service,
  SiwsNonceResponse,
  SiwsVerifyResponse,
  Vault,
} from "@/types/api";

type PageQuery = {
  limit?: number;
  before_slot?: number;
};

export const api = {
  // ---- Auth ----
  authNonce(pubkey: string): Promise<SiwsNonceResponse> {
    return request("/auth/nonce", { method: "POST", body: { pubkey }, anonymous: true });
  },

  authVerify(pubkey: string, nonce: string, signature: string): Promise<SiwsVerifyResponse> {
    return request("/auth/verify", {
      method: "POST",
      body: { pubkey, nonce, signature },
      anonymous: true,
    });
  },

  // ---- Agents (owner-scoped) ----
  listAgents(): Promise<Agent[]> {
    return request("/api/agents");
  },

  getAgent(pubkey: string): Promise<Agent> {
    return request(`/api/agents/${pubkey}`);
  },

  agentActivity(pubkey: string, query: PageQuery = {}): Promise<EventRow[]> {
    return request(`/api/agents/${pubkey}/activity`, { query });
  },

  agentScoreHistory(pubkey: string): Promise<ScorePoint[]> {
    return request(`/api/agents/${pubkey}/score/history`);
  },

  // ---- Vaults (owner-scoped) ----
  listVaults(): Promise<Vault[]> {
    return request("/api/vaults");
  },

  getVault(pubkey: string): Promise<Vault> {
    return request(`/api/vaults/${pubkey}`);
  },

  vaultActivity(pubkey: string, query: PageQuery = {}): Promise<EventRow[]> {
    return request(`/api/vaults/${pubkey}/activity`, { query });
  },

  // ---- Services (public registry) ----
  listServices(): Promise<Service[]> {
    return request("/api/services", { anonymous: true });
  },

  // ---- Public reputation lookup ----
  reputation(agent: string): Promise<ReputationLookup> {
    return request(`/reputation/${agent}`, { anonymous: true });
  },
};

export type Api = typeof api;
