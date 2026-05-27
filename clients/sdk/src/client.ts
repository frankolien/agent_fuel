import { AnchorError, BN } from "@coral-xyz/anchor";
import { Connection, PublicKey, type Keypair } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddress,
} from "./constants.js";
import {
  decodeCreditVault,
  decodeServiceRegistry,
  decodeSpendPolicy,
} from "./decoders.js";
import {
  AccountNotFoundError,
  HourlyLimitExceededError,
  HttpError,
  LifetimeLimitExceededError,
  NotWhitelistedError,
  OwnerNotConfiguredError,
  PerTxLimitExceededError,
  VaultFrozenError,
  ZeroAmountError,
} from "./errors.js";
import { guardSpend } from "./guardrails.js";
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
  // Optional vault owner. When set, `getVaultBalance()`, `getPolicy()`, and
  // `spend()` default to this owner so callers don't have to pass it on every
  // call. Per-method overrides still work for the "inspect someone else's
  // vault" case.
  owner?: Pubkeyish;
  apiBase?: string;
};

export type VaultRef = {
  owner?: Pubkeyish;
  agent?: Pubkeyish;
};

export type SpendArgs = {
  service: Pubkeyish;
  amountUsdc: number;
  owner?: Pubkeyish;
};

export type SpendResult = {
  signature: string;
};

const DEFAULT_API_BASE = "http://localhost:8080";

export class AgentFuel {
  readonly agent: Keypair;
  readonly cluster: Cluster;
  readonly connection: Connection;
  readonly apiBase: string;
  readonly owner: PublicKey | undefined;

  private _creditVault: CreditVaultProgram | undefined;
  private _reputation: ReputationProgram | undefined;

  constructor(opts: AgentFuelOptions) {
    this.agent = opts.agent;
    this.cluster = opts.cluster;
    this.connection =
      typeof opts.rpc === "string" ? new Connection(opts.rpc, "confirmed") : opts.rpc;
    this.apiBase = opts.apiBase ?? DEFAULT_API_BASE;
    this.owner = opts.owner ? toPubkey(opts.owner) : undefined;
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

  private resolveOwner(override?: Pubkeyish): PublicKey {
    const value = override ?? this.owner;
    if (!value) throw new OwnerNotConfiguredError();
    return toPubkey(value);
  }

  async getScore(agent?: Pubkeyish): Promise<ReputationLookup> {
    const target = agent ? toPubkey(agent) : this.agentPubkey;
    const agentStr = target.toBase58();
    const url = `${this.apiBase.replace(/\/$/, "")}/reputation/${agentStr}`;
    const res = await fetch(url);
    if (res.status === 404) throw new AccountNotFoundError(agentStr);
    if (!res.ok) throw new HttpError(res.status, url, await safeText(res));
    return (await res.json()) as ReputationLookup;
  }

  async getVaultBalance(ref?: VaultRef): Promise<CreditVaultAccount> {
    const owner = this.resolveOwner(ref?.owner);
    const agent = ref?.agent ? toPubkey(ref.agent) : this.agentPubkey;
    const pda = vaultPda(owner, agent);
    const raw = await this.creditVault.account.creditVault.fetchNullable(pda);
    if (!raw) throw new AccountNotFoundError(pda.toBase58());
    return decodeCreditVault(pda, raw);
  }

  async getPolicy(ref?: VaultRef): Promise<SpendPolicyAccount> {
    const owner = this.resolveOwner(ref?.owner);
    const agent = ref?.agent ? toPubkey(ref.agent) : this.agentPubkey;
    const vault = vaultPda(owner, agent);
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

  async spend(args: SpendArgs): Promise<SpendResult> {
    const owner = this.resolveOwner(args.owner);
    const service = toPubkey(args.service);
    const amountUsdc = args.amountUsdc;

    const vault = await this.getVaultBalance({ owner, agent: this.agentPubkey });
    const policy = await this.getPolicy({ owner, agent: this.agentPubkey });
    const currentSlot = await this.connection.getSlot();

    guardSpend({ vault, policy, service, amountUsdc, currentSlot });

    const serviceTokenAccount = getAssociatedTokenAddress(vault.usdc_mint, service);
    const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
      this.agentPubkey,
      serviceTokenAccount,
      service,
      vault.usdc_mint,
    );

    try {
      const signature = await this.creditVault.methods
        .spend(new BN(amountUsdc))
        .accounts({
          agent: this.agentPubkey,
          vault: vault.pubkey,
          policy: policy.pubkey,
          vaultTokenAccount: vault.vault_token_account,
          serviceTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .preInstructions([createAtaIx])
        .signers([this.agent])
        .rpc();
      return { signature };
    } catch (err) {
      throw mapSpendError(err, { service, amountUsdc, vault, policy });
    }
  }
}

// Re-throws Anchor `VaultError` codes as the same typed exceptions the local
// guardrail uses, so callers can `instanceof`-match without caring whether the
// rejection happened in the pre-flight or on-chain. Codes mirror
// `programs/credit_vault/src/errors.rs` (Anchor starts custom errors at 6000).
function mapSpendError(
  err: unknown,
  ctx: {
    service: PublicKey;
    amountUsdc: number;
    vault: CreditVaultAccount;
    policy: SpendPolicyAccount;
  },
): unknown {
  if (!(err instanceof AnchorError)) return err;
  switch (err.error.errorCode.number) {
    case 6001:
      return new ZeroAmountError();
    case 6002:
      return new VaultFrozenError();
    case 6003:
      return new NotWhitelistedError(ctx.service.toBase58());
    case 6004:
      return new PerTxLimitExceededError(ctx.amountUsdc, ctx.policy.per_tx_limit_usdc);
    case 6005:
      return new HourlyLimitExceededError(
        ctx.amountUsdc,
        ctx.policy.hourly_window_spent_usdc,
        ctx.policy.hourly_limit_usdc,
      );
    case 6006:
      return new LifetimeLimitExceededError(
        ctx.amountUsdc,
        ctx.vault.total_spent,
        ctx.policy.lifetime_limit_usdc,
      );
    default:
      return err;
  }
}

async function safeText(res: Response): Promise<string | undefined> {
  try {
    return await res.text();
  } catch {
    return undefined;
  }
}
