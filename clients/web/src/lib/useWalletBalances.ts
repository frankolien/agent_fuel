// Reads the connected wallet's SOL + USDC balances from chain. Used by the
// topbar pill and the Deposit modal so the user always knows what they can
// move into a vault.

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

export type WalletBalances = {
  solLamports: number;
  usdcMicro: number;
};

export function useWalletBalances(usdcMintPubkey: string | null): UseQueryResult<WalletBalances> {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const owner = publicKey?.toBase58() ?? null;

  return useQuery({
    queryKey: ["wallet-balances", owner, usdcMintPubkey],
    queryFn: async () => {
      if (!publicKey) throw new Error("wallet not connected");
      const solLamports = await connection.getBalance(publicKey, "confirmed");
      let usdcMicro = 0;
      if (usdcMintPubkey) {
        try {
          const mint = new PublicKey(usdcMintPubkey);
          const ata = await getAssociatedTokenAddress(mint, publicKey);
          const acc = await getAccount(connection, ata);
          usdcMicro = Number(acc.amount);
        } catch {
          // ATA may not exist yet — that's just zero balance.
          usdcMicro = 0;
        }
      }
      return { solLamports, usdcMicro };
    },
    enabled: !!publicKey,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

export function formatSol(lamports: number, digits = 3): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(digits);
}

export function formatUsdc(micro: number, digits = 2): string {
  return (micro / 1_000_000).toFixed(digits);
}
