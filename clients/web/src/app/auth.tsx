import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { authStore } from "@/lib/auth-store";

type AuthContextValue = {
  /** Wallet pubkey present in the active JWT, decoded from `sub`. null when signed out. */
  walletPubkey: string | null;
  isAuthenticated: boolean;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const [token, setToken] = useState<string | null>(() => authStore.getToken());

  useEffect(() => authStore.subscribe(setToken), []);

  // When the user disconnects the wallet (or switches to a different account),
  // tear down the session — the JWT was minted for the previous pubkey and
  // the backend will reject it anyway on the next call.
  useEffect(() => {
    if (!token) return;
    if (!wallet.connected) {
      authStore.setToken(null);
      return;
    }
    const expected = decodeSub(token);
    if (expected && wallet.publicKey && expected !== wallet.publicKey.toBase58()) {
      authStore.setToken(null);
    }
  }, [token, wallet.connected, wallet.publicKey]);

  const value: AuthContextValue = {
    walletPubkey: token ? decodeSub(token) : null,
    isAuthenticated: token !== null,
    signOut: () => {
      authStore.setToken(null);
      void wallet.disconnect().catch(() => {
        /* wallet may already be disconnected */
      });
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// The hook + provider are intentionally colocated — both share the private
// `AuthContext` and splitting them would either expose the context or
// duplicate it. The fast-refresh penalty (full reload when editing this
// file in dev) is an acceptable tradeoff for a file that changes rarely.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

// Best-effort JWT `sub` claim decode. We only use it for display + wallet-switch
// detection, so a malformed token returns null rather than throwing — the
// next API call's 401 handler will clean up.
function decodeSub(jwt: string): string | null {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    if (!payload) return null;
    const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=");
    const json = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json) as { sub?: string };
    return typeof claims.sub === "string" ? claims.sub : null;
  } catch {
    return null;
  }
}
