import { Connection, type Keypair, type PublicKey } from "@solana/web3.js";

export type Cluster = "mainnet-beta" | "devnet" | "testnet" | "localnet";

export type AgentFuelOptions = {
  agent: Keypair;
  cluster: Cluster;
  rpc: string | Connection;
  apiBase?: string;
};

const DEFAULT_API_BASE = "http://localhost:8080";

export class AgentFuel {
  readonly agent: Keypair;
  readonly cluster: Cluster;
  readonly connection: Connection;
  readonly apiBase: string;

  constructor(opts: AgentFuelOptions) {
    this.agent = opts.agent;
    this.cluster = opts.cluster;
    this.connection =
      typeof opts.rpc === "string" ? new Connection(opts.rpc, "confirmed") : opts.rpc;
    this.apiBase = opts.apiBase ?? DEFAULT_API_BASE;
  }

  get agentPubkey(): PublicKey {
    return this.agent.publicKey;
  }
}
