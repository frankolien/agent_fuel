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
import { subscribe, wsUrl } from "./live.js";
import { pay as payStandalone, type PayArgs, type PayResult } from "./pay.js";
import {
  requestSpend as requestSpendStandalone,
  type RequestSpendArgs,
  type RequestSpendResult,
} from "./request-spend.js";
import {
  registerService as registerServiceStandalone,
  type RegisterServiceArgs,
  type RegisterServiceResult,
} from "./register-service.js";
import {
  agentProfilePda,
  policyPda,
  serviceRegistryPda,
  toPubkey,
  vaultPda,
} from "./pda.js";
import {
  buildProvider,
  creditVaultProgram,
  reputationProgram,
  type CreditVaultProgram,
  type ReputationProgram,
} from "./programs.js";
import type {
  CreditVaultAccount,
  LiveEventFrame,
  LiveStatus,
  Pubkeyish,
  ReputationLookup,
  ServiceRegistryAccount,
  SpendPolicyAccount,
  Subscription,
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

export type OnEventOptions = {
  agent?: Pubkeyish;
  onStatus?: (status: LiveStatus) => void;
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

  /// Atomic spend + record_payment in one transaction. Use this instead
  /// of `spend()` + `recordPayment()` when you want the vault burn and
  /// the reputation accrual to be all-or-nothing. The service keypair
  /// co-signs.
  async pay(
    args: Omit<PayArgs, "connection" | "agent" | "owner"> & { owner?: Pubkeyish },
  ): Promise<PayResult> {
    return payStandalone({
      agent: this.agent,
      owner: this.resolveOwner(args.owner),
      service: args.service,
      amountUsdc: args.amountUsdc,
      receiptHash: args.receiptHash,
      connection: this.connection,
    });
  }

  /// Submit an over-limit spend request the owner can approve from the
  /// mobile app. Returns the `pendingSpend` PDA so the bot can poll for
  /// resolution.
  async requestSpend(
    args: Omit<RequestSpendArgs, "connection" | "agent" | "owner"> & { owner?: Pubkeyish },
  ): Promise<RequestSpendResult> {
    return requestSpendStandalone({
      agent: this.agent,
      owner: this.resolveOwner(args.owner),
      service: args.service,
      amountUsdc: args.amountUsdc,
      connection: this.connection,
    });
  }

  /// Register a service on chain. The `sponsor` (typically `this.agent`'s
  /// owner wallet) pays rent; the `service` keypair is the long-lived
  /// identity that will co-sign every future `record_payment`.
  async registerService(
    args: Omit<RegisterServiceArgs, "connection">,
  ): Promise<RegisterServiceResult> {
    return registerServiceStandalone({ ...args, connection: this.connection });
  }

  /// Triggers an on-chain recomputation of the agent's reputation score.
  /// Permissionless — any signer can call it; we use the agent itself since
  /// the SDK already has its keypair available and it already pays tx fees
  /// for spends. The instruction reads the agent's already-public counters
  /// (volume, diversity, streak, tenure, feedback), recalculates the score
  /// to a single u16 ≤ 1000, and emits a `ScoreComputed` event. The webhook
  /// picks that up; the next `getScore()` returns the fresh value.
  async computeScore(): Promise<{ signature: string }> {
    const profile = agentProfilePda(this.agentPubkey);
    const signature = await this.reputation.methods
      .computeScore()
      .accounts({
        caller: this.agentPubkey,
        agentProfile: profile,
      })
      .signers([this.agent])
      .rpc();
    return { signature };
  }

  onEvent(
    callback: (frame: LiveEventFrame) => void,
    options?: OnEventOptions,
  ): Subscription {
    const target = options?.agent ? toPubkey(options.agent) : this.agentPubkey;
    const url = wsUrl(this.apiBase, `/ws/agents/${target.toBase58()}`);
    const subOpts: { onFrame: (frame: LiveEventFrame) => void; onStatus?: (status: LiveStatus) => void } = {
      onFrame: callback,
    };
    if (options?.onStatus) subOpts.onStatus = options.onStatus;
    return subscribe(url, subOpts);
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
