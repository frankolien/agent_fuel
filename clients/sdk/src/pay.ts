// Atomic spend + record_payment in one transaction. The agent signs the
// spend half (credit_vault), the service keypair signs the reputation
// half (record_payment). Both land or neither does — no half-states
// where USDC moved but reputation didn't.
//
// Mirrors `Spender::pay()` in `clients/runtime/src/lib.rs`.

import { AnchorError, BN } from "@coral-xyz/anchor";
import {
  Connection,
  type Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddress,
} from "./constants.js";
import { decodeCreditVault, decodeSpendPolicy } from "./decoders.js";
import {
  AccountNotFoundError,
  HourlyLimitExceededError,
  LifetimeLimitExceededError,
  NotWhitelistedError,
  PerTxLimitExceededError,
  ReceiptAlreadyRecordedError,
  RecordPaymentError,
  ServiceInactiveError,
  VaultFrozenError,
  ZeroAmountError,
} from "./errors.js";
import { guardSpend } from "./guardrails.js";
import {
  agentProfilePda,
  agentServiceLinkPda,
  policyPda,
  receiptUsedPda,
  serviceRegistryPda,
  toPubkey,
  vaultPda,
} from "./pda.js";
import {
  buildProvider,
  creditVaultProgram,
  reputationProgram,
} from "./programs.js";
import type { CreditVaultAccount, Pubkeyish, SpendPolicyAccount } from "./types.js";

export type PayArgs = {
  /** Agent keypair — spends from the vault and pays tx fees. */
  agent: Keypair;
  /** Service keypair — co-signs the reputation half. Its pubkey must
   *  match the service registered on chain. */
  service: Keypair;
  /** Vault owner. */
  owner: Pubkeyish;
  /** Amount in micro-USDC. */
  amountUsdc: number;
  /** 32-byte receipt hash. Common: `sha256(agent|service|tick|...)`. */
  receiptHash: Uint8Array;
  connection: Connection;
};

export type PayResult = {
  signature: string;
};

/**
 * Atomic spend + record_payment. The vault burn and reputation accrual
 * happen in one transaction — without this, a service could mirror only
 * payments it actually received, but the agent's score wouldn't reflect
 * its own spending. Both sides of the SDK need this primitive to keep
 * reputation honest.
 */
export async function pay(args: PayArgs): Promise<PayResult> {
  const { agent, service, connection, amountUsdc } = args;
  const owner = toPubkey(args.owner);

  if (amountUsdc <= 0) {
    throw new ZeroAmountError();
  }
  if (args.receiptHash.length !== 32) {
    throw new Error(
      `pay: receiptHash must be 32 bytes, got ${args.receiptHash.length}`,
    );
  }

  const vaultAddr = vaultPda(owner, agent.publicKey);
  const policyAddr = policyPda(vaultAddr);

  // Pre-flight against the local guardrail — bails on obvious policy
  // violations before we burn a tx slot. Mirrors `spend()` in client.ts.
  const provider = buildProvider(connection, agent);
  const cv = creditVaultProgram(provider);
  const rep = reputationProgram(provider);

  const [rawVault, rawPolicy, currentSlot] = await Promise.all([
    cv.account.creditVault.fetchNullable(vaultAddr),
    cv.account.spendPolicy.fetchNullable(policyAddr),
    connection.getSlot(),
  ]);
  if (!rawVault) throw new AccountNotFoundError(vaultAddr.toBase58());
  if (!rawPolicy) throw new AccountNotFoundError(policyAddr.toBase58());
  const vault = decodeCreditVault(vaultAddr, rawVault);
  const policy = decodeSpendPolicy(policyAddr, rawPolicy);
  guardSpend({
    vault,
    policy,
    service: service.publicKey,
    amountUsdc,
    currentSlot,
  });

  const serviceTokenAccount = getAssociatedTokenAddress(
    vault.usdc_mint,
    service.publicKey,
  );
  const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    agent.publicKey,
    serviceTokenAccount,
    service.publicKey,
    vault.usdc_mint,
  );

  const agentProfile = agentProfilePda(agent.publicKey);
  const serviceRegistry = serviceRegistryPda(service.publicKey);
  const link = agentServiceLinkPda(agentProfile, serviceRegistry);
  const receipt = receiptUsedPda(args.receiptHash);

  // `.instruction()` is a stable Anchor API but isn't on our typed
  // builder wrappers (which only expose `.rpc()` for the typical happy
  // path). Cast at the boundary to compose multi-program txs ourselves.
  type InstructionBuilder = {
    instruction(): Promise<import("@solana/web3.js").TransactionInstruction>;
  };
  const spendBuilder = cv.methods.spend(new BN(amountUsdc)).accounts({
    agent: agent.publicKey,
    vault: vaultAddr,
    policy: policyAddr,
    vaultTokenAccount: vault.vault_token_account,
    serviceTokenAccount,
    tokenProgram: TOKEN_PROGRAM_ID,
  }) as unknown as InstructionBuilder;
  const recordBuilder = rep.methods
    .recordPayment(new BN(amountUsdc), args.receiptHash)
    .accounts({
      service: service.publicKey,
      agentProfile,
      serviceRegistry,
      agentServiceLink: link,
      receiptUsed: receipt,
      systemProgram: SystemProgram.programId,
    }) as unknown as InstructionBuilder;
  const spendIx = await spendBuilder.instruction();
  const recordIx = await recordBuilder.instruction();

  const tx = new Transaction().add(createAtaIx, spendIx, recordIx);
  try {
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [agent, service],
      { commitment: "confirmed" },
    );
    return { signature };
  } catch (err) {
    throw mapPayError(err, {
      service: service.publicKey,
      amountUsdc,
      vault,
      policy,
      receiptHash: args.receiptHash,
    });
  }
}

function mapPayError(
  err: unknown,
  ctx: {
    service: PublicKey;
    amountUsdc: number;
    vault: CreditVaultAccount;
    policy: SpendPolicyAccount;
    receiptHash: Uint8Array;
  },
): unknown {
  const message = err instanceof Error ? err.message : String(err);
  if (/already in use/i.test(message)) {
    return new ReceiptAlreadyRecordedError(ctx.receiptHash);
  }
  if (!(err instanceof AnchorError)) return err;
  // Credit vault errors are 6000-range; reputation errors overlap but
  // come from a different program — the AnchorError's program field
  // tells us which is throwing.
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
    // Reputation errors:
    case 6000:
      return new RecordPaymentError("counter overflow on chain");
    case 6011: // ServiceInactive in reputation program
      return new ServiceInactiveError(ctx.service.toBase58());
    default:
      return err;
  }
}
