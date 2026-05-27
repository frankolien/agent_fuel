// Build-time env, read once and frozen so runtime code can't accidentally mutate.
//
// VITE_API_BASE     — backend origin, e.g. http://localhost:8080
// VITE_USE_MOCKS    — "1" to short-circuit HTTP/WS calls with in-memory seed data
// VITE_SOLANA_RPC   — Solana RPC endpoint for the wallet adapter (devnet default)
// VITE_SOLANA_CLUSTER — "devnet" | "mainnet-beta" | "testnet" (display only)

const env = import.meta.env;

export const config = Object.freeze({
  apiBase: (env.VITE_API_BASE ?? "http://localhost:8080").replace(/\/$/, ""),
  useMocks: env.VITE_USE_MOCKS === "1",
  solanaRpc: env.VITE_SOLANA_RPC ?? "https://api.devnet.solana.com",
  solanaCluster: (env.VITE_SOLANA_CLUSTER ?? "devnet") as "devnet" | "mainnet-beta" | "testnet",
});

export type Config = typeof config;
