import { AnchorProvider, Program, Wallet, type Idl } from "@coral-xyz/anchor";
import {
  type ConfirmOptions,
  type Connection,
  type Keypair,
  type PublicKey,
  type TransactionInstruction,
} from "@solana/web3.js";
import creditVaultIdl from "./idl/credit-vault.json" with { type: "json" };
import reputationIdl from "./idl/reputation.json" with { type: "json" };
import type BN from "bn.js";

export type RawCreditVault = {
  owner: PublicKey;
  agent: PublicKey;
  usdcMint: PublicKey;
  vaultTokenAccount: PublicKey;
  totalDeposited: BN;
  totalWithdrawn: BN;
  totalSpent: BN;
  totalClaimed: BN;
  frozen: boolean;
  createdSlot: BN;
  lastActiveSlot: BN;
};

export type RawSpendPolicy = {
  vault: PublicKey;
  whitelist: PublicKey[];
  perTxLimitUsdc: BN;
  hourlyLimitUsdc: BN;
  lifetimeLimitUsdc: BN;
  hourlyWindowStartSlot: BN;
  hourlyWindowSpentUsdc: BN;
  allowPostPay: boolean;
};

export type RawServiceRegistry = {
  authority: PublicKey;
  name: number[];
  category:
    | { dataFeed: Record<string, never> }
    | { compute: Record<string, never> }
    | { swap: Record<string, never> }
    | { rpc: Record<string, never> }
    | { other: Record<string, never> };
  totalAgentsServed: BN;
  totalVolumeReceivedUsdc: BN;
  active: boolean;
  firstActiveSlot: BN;
  lastActiveSlot: BN;
};

type Fetchable<T> = {
  fetchNullable(address: PublicKey): Promise<T | null>;
};

export type SpendAccounts = {
  agent: PublicKey;
  vault: PublicKey;
  policy: PublicKey;
  vaultTokenAccount: PublicKey;
  serviceTokenAccount: PublicKey;
  tokenProgram: PublicKey;
};

type SpendBuilder = {
  accounts(accounts: SpendAccounts): {
    preInstructions(instructions: readonly TransactionInstruction[]): {
      signers(signers: readonly Keypair[]): {
        rpc(opts?: ConfirmOptions): Promise<string>;
      };
    };
    signers(signers: readonly Keypair[]): {
      rpc(opts?: ConfirmOptions): Promise<string>;
    };
  };
};

export type CreditVaultProgram = {
  account: {
    creditVault: Fetchable<RawCreditVault>;
    spendPolicy: Fetchable<RawSpendPolicy>;
  };
  methods: {
    spend(amountUsdc: BN): SpendBuilder;
  };
};

export type ComputeScoreAccounts = {
  caller: PublicKey;
  agentProfile: PublicKey;
};

type ComputeScoreBuilder = {
  accounts(accounts: ComputeScoreAccounts): {
    signers(signers: readonly Keypair[]): {
      rpc(opts?: ConfirmOptions): Promise<string>;
    };
  };
};

export type RecordPaymentAccounts = {
  service: PublicKey;
  agentProfile: PublicKey;
  serviceRegistry: PublicKey;
  agentServiceLink: PublicKey;
  receiptUsed: PublicKey;
  systemProgram: PublicKey;
};

type RecordPaymentBuilder = {
  accounts(accounts: RecordPaymentAccounts): {
    signers(signers: readonly Keypair[]): {
      rpc(opts?: ConfirmOptions): Promise<string>;
    };
  };
};

export type ReputationProgram = {
  account: {
    serviceRegistry: Fetchable<RawServiceRegistry>;
  };
  methods: {
    computeScore(): ComputeScoreBuilder;
    recordPayment(
      amountUsdc: BN,
      paymentReceiptHash: number[] | Uint8Array,
    ): RecordPaymentBuilder;
  };
};

export function buildProvider(connection: Connection, keypair: Keypair): AnchorProvider {
  return new AnchorProvider(connection, new Wallet(keypair), AnchorProvider.defaultOptions());
}

export function creditVaultProgram(provider: AnchorProvider): CreditVaultProgram {
  return new Program(creditVaultIdl as unknown as Idl, provider) as unknown as CreditVaultProgram;
}

export function reputationProgram(provider: AnchorProvider): ReputationProgram {
  return new Program(reputationIdl as unknown as Idl, provider) as unknown as ReputationProgram;
}
