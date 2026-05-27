import { PublicKey } from "@solana/web3.js";
import reputationIdl from "./idl/reputation.json" with { type: "json" };
import creditVaultIdl from "./idl/credit-vault.json" with { type: "json" };

export const PROGRAM_IDS = {
  reputation: new PublicKey(reputationIdl.address),
  creditVault: new PublicKey(creditVaultIdl.address),
} as const;
