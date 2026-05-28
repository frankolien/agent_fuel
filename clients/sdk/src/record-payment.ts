// Service-side attestation that an agent paid them. Distinct from the
// agent's `af.spend()` — that one runs on credit_vault and moves USDC;
// this one runs on reputation and updates the agent ↔ service counters
// that ultimately feed `compute_score`.
//
// The two are deliberately separate so a service can attest only payments
// it actually received (an agent can't unilaterally inflate its own counters
// by emitting fake payment events).

import { AnchorError, BN } from "@coral-xyz/anchor";
import { Connection, type Keypair, SystemProgram } from "@solana/web3.js";
import {
  ReceiptAlreadyRecordedError,
  RecordPaymentError,
  ServiceInactiveError,
  ZeroAmountError,
} from "./errors.js";
import {
  agentProfilePda,
  agentServiceLinkPda,
  receiptUsedPda,
  serviceRegistryPda,
  toPubkey,
} from "./pda.js";
import { buildProvider, reputationProgram } from "./programs.js";
import type { Pubkeyish } from "./types.js";

export type RecordPaymentArgs = {
  /** Service authority keypair. Signs the tx and pays the fee. Must match
   *  the same keypair that was registered on chain as the service authority. */
  service: Keypair;
  /** Agent identity pubkey (NOT the AgentProfile PDA — we derive that). */
  agent: Pubkeyish;
  /** Amount in micro-USDC (1_000_000 = 1 USDC). */
  amountUsdc: number;
  /** 32-byte hash that uniquely identifies this payment. Common choice:
   *  `sha256(spendTxSignature)` — the spend signature is unique on chain,
   *  so its hash is too. The chain enforces single-use via `init` on the
   *  ReceiptUsed PDA; resubmitting the same hash fails with AccountAlreadyInUse. */
  receiptHash: Uint8Array;
  connection: Connection;
};

export type RecordPaymentResult = {
  signature: string;
};

export async function recordPayment(
  args: RecordPaymentArgs,
): Promise<RecordPaymentResult> {
  const { service, connection, amountUsdc } = args;
  const agentPubkey = toPubkey(args.agent);

  if (amountUsdc <= 0) {
    throw new Error("recordPayment: amountUsdc must be > 0");
  }
  if (args.receiptHash.length !== 32) {
    throw new Error(
      `recordPayment: receiptHash must be 32 bytes, got ${args.receiptHash.length}`,
    );
  }

  const provider = buildProvider(connection, service);
  const program = reputationProgram(provider);

  const agentProfile = agentProfilePda(agentPubkey);
  const serviceRegistry = serviceRegistryPda(service.publicKey);
  const link = agentServiceLinkPda(agentProfile, serviceRegistry);
  const receipt = receiptUsedPda(args.receiptHash);

  try {
    const signature = await program.methods
      .recordPayment(new BN(amountUsdc), args.receiptHash)
      .accounts({
        service: service.publicKey,
        agentProfile,
        serviceRegistry,
        agentServiceLink: link,
        receiptUsed: receipt,
        systemProgram: SystemProgram.programId,
      })
      .signers([service])
      .rpc();
    return { signature };
  } catch (err) {
    throw mapRecordPaymentError(err, args.receiptHash);
  }
}

// Anchor custom errors for the reputation program start at 6000; the order
// matches `programs/reputation/src/errors.rs::ReputationError`. The
// "AccountAlreadyInUse" case isn't a custom error — it's the system program's
// 0x0, fired by Anchor's `init` constraint on ReceiptUsed when the same hash
// has already been recorded.
function mapRecordPaymentError(err: unknown, receiptHash: Uint8Array): unknown {
  // System program rejects duplicate inits with logs containing
  // "already in use" — surface this as a typed, idempotent-friendly error.
  const message = err instanceof Error ? err.message : String(err);
  if (/already in use/i.test(message)) {
    return new ReceiptAlreadyRecordedError(receiptHash);
  }
  if (!(err instanceof AnchorError)) return err;
  switch (err.error.errorCode.number) {
    case 6000:
      return new RecordPaymentError("counter overflow on chain");
    case 6001:
      return new ServiceInactiveError(
        err.error.origin?.toString() ?? "<unknown service>",
      );
    case 6002:
      return new ZeroAmountError();
    default:
      return err;
  }
}
