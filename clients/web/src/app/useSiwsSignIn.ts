import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { api } from "@/lib/api/client";
import { authStore } from "@/lib/auth-store";

type Status = "idle" | "requesting-nonce" | "awaiting-signature" | "verifying" | "error";

type SignInResult = {
  status: Status;
  error: string | null;
  /** Walks the nonce → sign → verify pipeline. Resolves once the JWT is stored. */
  signIn: () => Promise<boolean>;
  reset: () => void;
};

// Standard Solana wallet adapter ed25519 signing. We base58-encode the
// signature on the wire to match the backend's `bs58::decode(signature)` path
// in routes/auth.rs.
export function useSiwsSignIn(): SignInResult {
  const wallet = useWallet();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStatus("idle");
    setError(null);
  };

  async function signIn(): Promise<boolean> {
    setError(null);

    if (!wallet.publicKey) {
      setStatus("error");
      setError("Connect a wallet first.");
      return false;
    }
    if (!wallet.signMessage) {
      setStatus("error");
      setError("This wallet doesn't support message signing.");
      return false;
    }

    const pubkey = wallet.publicKey.toBase58();

    try {
      setStatus("requesting-nonce");
      const { message, nonce } = await api.authNonce(pubkey);

      setStatus("awaiting-signature");
      const encoded = new TextEncoder().encode(message);
      const signatureBytes = await wallet.signMessage(encoded);
      const signature = bs58.encode(signatureBytes);

      setStatus("verifying");
      const { token } = await api.authVerify(pubkey, nonce, signature);
      authStore.setToken(token);

      setStatus("idle");
      return true;
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      return false;
    }
  }

  return { status, error, signIn, reset };
}
