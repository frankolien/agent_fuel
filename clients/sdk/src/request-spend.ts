// Agent-initiated half of the over-limit approval flow. Creates a
// PendingSpend account the owner can later approve via mobile / CLI.
// The returned `pendingSpend` pubkey is what callers poll for resolution.

import { BN } from "@coral-xyz/anchor";
import {
  Connection,
  type Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { getAssociatedTokenAddress } from "./constants.js";
import { decodeCreditVault } from "./decoders.js";
import { AccountNotFoundError } from "./errors.js";
import {
  pendingSpendPda,
  toPubkey,
  vaultPda,
} from "./pda.js";
import { buildProvider, creditVaultProgram } from "./programs.js";
import type { Pubkeyish } from "./types.js";

export type RequestSpendArgs = {
  agent: Keypair;
  owner: Pubkeyish;
  service: Pubkeyish;
  amountUsdc: number;
  connection: Connection;
};

export type RequestSpendResult = {
  signature: string;
  /** The PendingSpend account the owner approves / cancels and the bot
   *  polls for resolution. */
  pendingSpend: PublicKey;
  /** Vault nonce burned by this request. */
  nonce: number;
};

export async function requestSpend(
  args: RequestSpendArgs,
): Promise<RequestSpendResult> {
  const { agent, connection, amountUsdc } = args;
  const owner = toPubkey(args.owner);
  const service = toPubkey(args.service);

  if (amountUsdc <= 0) {
    throw new Error("requestSpend: amountUsdc must be > 0");
  }

  const vaultAddr = vaultPda(owner, agent.publicKey);
  const provider = buildProvider(connection, agent);
  const cv = creditVaultProgram(provider);

  // Read current pending_count off the vault so we derive the correct
  // PendingSpend PDA seed without an extra account write.
  const rawVault = await cv.account.creditVault.fetchNullable(vaultAddr);
  if (!rawVault) throw new AccountNotFoundError(vaultAddr.toBase58());
  const vault = decodeCreditVault(vaultAddr, rawVault);
  const nonce = vault.pending_count;
  const pendingSpend = pendingSpendPda(vaultAddr, nonce);
  const serviceTokenAccount = getAssociatedTokenAddress(
    vault.usdc_mint,
    service,
  );

  const signature = await cv.methods
    .requestSpend(new BN(amountUsdc))
    .accounts({
      agent: agent.publicKey,
      vault: vaultAddr,
      serviceTokenAccount,
      pendingSpend,
      systemProgram: SystemProgram.programId,
    })
    .signers([agent])
    .rpc();

  return { signature, pendingSpend, nonce };
}
