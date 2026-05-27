// Typed API client. Every screen calls these — never `fetch` directly — so
// auth headers, error decoding, and the mock swap all live in one place.
//
// When VITE_USE_MOCKS=1, calls return seeded data from ./mocks instead of
// hitting the network. The UI stays the same; only this module changes.

import { config } from "../config";
import { HttpError, request } from "../http";
import type {
  Agent,
  EventRow,
  ReputationLookup,
  ScorePoint,
  SiwsNonceResponse,
  SiwsVerifyResponse,
  Vault,
} from "@/types/api";
import {
  MOCK_AGENTS,
  MOCK_EVENTS,
  MOCK_VAULTS,
  mockReputation,
  mockScoreHistory,
  mockSiwsNonce,
  mockSiwsVerify,
  pageOf,
} from "./mocks";

type PageQuery = {
  limit?: number;
  before_slot?: number;
};

function delay<T>(value: T, ms = 120): Promise<T> {
  return new Promise((resolve) => window.setTimeout(() => resolve(value), ms));
}

function notFound(label: string, key: string): never {
  throw new HttpError(404, "Not Found", { error: `${label} ${key} not found` }, `mock:${label}/${key}`);
}

export const api = {
  // ---- Auth ----
  authNonce(pubkey: string): Promise<SiwsNonceResponse> {
    if (config.useMocks) return delay(mockSiwsNonce(pubkey));
    return request("/auth/nonce", { method: "POST", body: { pubkey }, anonymous: true });
  },

  authVerify(pubkey: string, nonce: string, signature: string): Promise<SiwsVerifyResponse> {
    if (config.useMocks) return delay(mockSiwsVerify());
    return request("/auth/verify", {
      method: "POST",
      body: { pubkey, nonce, signature },
      anonymous: true,
    });
  },

  // ---- Agents (owner-scoped) ----
  listAgents(): Promise<Agent[]> {
    if (config.useMocks) return delay([...MOCK_AGENTS]);
    return request("/api/agents");
  },

  getAgent(pubkey: string): Promise<Agent> {
    if (config.useMocks) {
      const found = MOCK_AGENTS.find((a) => a.pubkey === pubkey);
      if (!found) notFound("agent", pubkey);
      return delay(found);
    }
    return request(`/api/agents/${pubkey}`);
  },

  agentActivity(pubkey: string, query: PageQuery = {}): Promise<EventRow[]> {
    if (config.useMocks) {
      const filtered = MOCK_EVENTS.filter((e) => e.payload["agent"] === pubkey);
      return delay(pageOf(filtered, query.limit ?? 50, query.before_slot));
    }
    return request(`/api/agents/${pubkey}/activity`, { query });
  },

  agentScoreHistory(pubkey: string): Promise<ScorePoint[]> {
    if (config.useMocks) return delay(mockScoreHistory(pubkey));
    return request(`/api/agents/${pubkey}/score/history`);
  },

  // ---- Vaults (owner-scoped) ----
  listVaults(): Promise<Vault[]> {
    if (config.useMocks) return delay([...MOCK_VAULTS]);
    return request("/api/vaults");
  },

  getVault(pubkey: string): Promise<Vault> {
    if (config.useMocks) {
      const found = MOCK_VAULTS.find((v) => v.pubkey === pubkey);
      if (!found) notFound("vault", pubkey);
      return delay(found);
    }
    return request(`/api/vaults/${pubkey}`);
  },

  vaultActivity(pubkey: string, query: PageQuery = {}): Promise<EventRow[]> {
    if (config.useMocks) {
      const vaultFound = MOCK_VAULTS.find((v) => v.pubkey === pubkey);
      if (!vaultFound) notFound("vault", pubkey);
      const filtered = MOCK_EVENTS.filter(
        (e) => e.payload["agent"] === vaultFound.agent || e.payload["vault"] === pubkey,
      );
      return delay(pageOf(filtered, query.limit ?? 50, query.before_slot));
    }
    return request(`/api/vaults/${pubkey}/activity`, { query });
  },

  // ---- Public reputation lookup ----
  reputation(agent: string): Promise<ReputationLookup> {
    if (config.useMocks) {
      const found = mockReputation(agent);
      if (!found) notFound("agent", agent);
      return delay(found);
    }
    return request(`/reputation/${agent}`, { anonymous: true });
  },
};

export type Api = typeof api;
