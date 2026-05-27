import { useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import type { Adapter } from "@solana/wallet-adapter-base";
import { config } from "@/lib/config";

import "@solana/wallet-adapter-react-ui/styles.css";

type Props = { children: ReactNode };

export function WalletProviders({ children }: Props) {
  // Wallet Standard auto-discovers Phantom, Backpack, Solflare, etc., so we
  // pass an empty adapter list rather than hard-coding adapters that may move
  // to or away from the standard between versions.
  const wallets = useMemo<Adapter[]>(() => [], []);
  const endpoint = useMemo(() => config.solanaRpc, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
