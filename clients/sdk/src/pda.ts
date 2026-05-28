import { PublicKey } from "@solana/web3.js";
import { PROGRAM_IDS } from "./program-ids.js";
import type { Pubkeyish } from "./types.js";

export function toPubkey(value: Pubkeyish): PublicKey {
  return value instanceof PublicKey ? value : new PublicKey(value);
}

export function vaultPda(owner: Pubkeyish, agent: Pubkeyish): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), toPubkey(owner).toBuffer(), toPubkey(agent).toBuffer()],
    PROGRAM_IDS.creditVault,
  );
  return pda;
}

export function policyPda(vault: Pubkeyish): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), toPubkey(vault).toBuffer()],
    PROGRAM_IDS.creditVault,
  );
  return pda;
}

export function serviceRegistryPda(serviceAuthority: Pubkeyish): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("service"), toPubkey(serviceAuthority).toBuffer()],
    PROGRAM_IDS.reputation,
  );
  return pda;
}

export function agentProfilePda(agent: Pubkeyish): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), toPubkey(agent).toBuffer()],
    PROGRAM_IDS.reputation,
  );
  return pda;
}

/** PDA used by `record_payment` to track the agent ↔ service pair. The seeds
 *  are the *PDAs* of the agent profile and service registry, not the raw
 *  authority pubkeys — match the on-chain Anchor account constraint. */
export function agentServiceLinkPda(
  agentProfile: Pubkeyish,
  serviceRegistry: Pubkeyish,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("link"),
      toPubkey(agentProfile).toBuffer(),
      toPubkey(serviceRegistry).toBuffer(),
    ],
    PROGRAM_IDS.reputation,
  );
  return pda;
}

/** Existence-as-signal: a `ReceiptUsed` PDA at `[b"receipt", hash]` proves
 *  the receipt has been recorded. `record_payment`'s `init` constraint (not
 *  `init_if_needed`) means a duplicate hash fails with `AccountAlreadyInUse`,
 *  which is the chain-side replay defence. */
export function receiptUsedPda(receiptHash: Uint8Array): PublicKey {
  if (receiptHash.length !== 32) {
    throw new Error(`receiptUsedPda expects a 32-byte hash, got ${receiptHash.length}`);
  }
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("receipt"), Buffer.from(receiptHash)],
    PROGRAM_IDS.reputation,
  );
  return pda;
}
