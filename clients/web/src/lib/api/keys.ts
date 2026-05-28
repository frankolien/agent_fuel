// Canonical query keys. Centralising them prevents typos that cause silent
// cache misses, and gives us one place to invalidate cross-cutting groups
// (e.g. after a wallet switch, drop everything under `agents()` and `vaults()`).

export const queryKeys = {
  agents: () => ["agents"] as const,
  agent: (pubkey: string) => ["agents", pubkey] as const,
  agentActivity: (pubkey: string) => ["agents", pubkey, "activity"] as const,
  agentScoreHistory: (pubkey: string) => ["agents", pubkey, "score-history"] as const,
  agentVaults: (pubkey: string) => ["agents", pubkey, "vaults"] as const,

  vaults: () => ["vaults"] as const,
  vault: (pubkey: string) => ["vaults", pubkey] as const,
  vaultActivity: (pubkey: string) => ["vaults", pubkey, "activity"] as const,

  reputation: (agent: string) => ["reputation", agent] as const,
};
