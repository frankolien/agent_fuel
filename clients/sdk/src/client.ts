import { Connection, type Keypair, type PublicKey } from "@solana/web3.js";
import {
  decodeCreditVault,
  decodeServiceRegistry,
  decodeSpendPolicy,
} from "./decoders.js";
import { AccountNotFoundError, HttpError } from "./errors.js";
import { policyPda, serviceRegistryPda, toPubkey, vaultPda } from "./pda.js";
import {
  buildProvider,
  creditVaultProgram,
  reputationProgram,
  type CreditVaultProgram,
  type ReputationProgram,
} from "./programs.js";
import type {
  CreditVaultAccount,
  Pubkeyish,
  ReputationLookup,
  ServiceRegistryAccount,
  SpendPolicyAccount,
} from "./types.js";

export type Cluster = "mainnet-beta" | "devnet" | "testnet" | "localnet";

export type AgentFuelOptions = {
  agent: Keypair;
  cluster: Cluster;
  rpc: string | Connection;
  apiBase?: string;
};

export type VaultRef = {
  owner: Pubkeyish;
  agent: Pubkeyish;
};

const DEFAULT_API_BASE = "http://localhost:8080";

export class AgentFuel {
  readonly agent: Keypair;
  readonly cluster: Cluster;
  readonly connection: Connection;
  readonly apiBase: string;

  private _creditVault: CreditVaultProgram | undefined;
  private _reputation: ReputationProgram | undefined;

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

  private get creditVault(): CreditVaultProgram {
    if (!this._creditVault) {
      this._creditVault = creditVaultProgram(buildProvider(this.connection, this.agent));
    }
    return this._creditVault;
  }

  private get reputation(): ReputationProgram {
    if (!this._reputation) {
      this._reputation = reputationProgram(buildProvider(this.connection, this.agent));
    }
    return this._reputation;
  }

  async getScore(agent: Pubkeyish): Promise<ReputationLookup> {
    const agentStr = toPubkey(agent).toBase58();
    const url = `${this.apiBase.replace(/\/$/, "")}/reputation/${agentStr}`;
    const res = await fetch(url);
    if (res.status === 404) throw new AccountNotFoundError(agentStr);
    if (!res.ok) throw new HttpError(res.status, url, await safeText(res));
    return (await res.json()) as ReputationLookup;
  }

  async getVaultBalance(ref: VaultRef): Promise<CreditVaultAccount> {
    const pda = vaultPda(ref.owner, ref.agent);
    const raw = await this.creditVault.account.creditVault.fetchNullable(pda);
    if (!raw) throw new AccountNotFoundError(pda.toBase58());
    return decodeCreditVault(pda, raw);
  }

  async getPolicy(ref: VaultRef): Promise<SpendPolicyAccount> {
    const vault = vaultPda(ref.owner, ref.agent);
    const pda = policyPda(vault);
    const raw = await this.creditVault.account.spendPolicy.fetchNullable(pda);
    if (!raw) throw new AccountNotFoundError(pda.toBase58());
    return decodeSpendPolicy(pda, raw);
  }

  async checkService(serviceAuthority: Pubkeyish): Promise<ServiceRegistryAccount> {
    const pda = serviceRegistryPda(serviceAuthority);
    const raw = await this.reputation.account.serviceRegistry.fetchNullable(pda);
    if (!raw) throw new AccountNotFoundError(pda.toBase58());
    return decodeServiceRegistry(pda, raw);
  }
}

async function safeText(res: Response): Promise<string | undefined> {
  try {
    return await res.text();
  } catch {
    return undefined;
  }
}
