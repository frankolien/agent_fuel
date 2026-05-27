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
