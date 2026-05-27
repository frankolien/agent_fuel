import { useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Brand } from "@/components/Brand/Brand";
import { config } from "@/lib/config";
import { useAuth } from "@/app/auth";
import { useSiwsSignIn } from "@/app/useSiwsSignIn";

type LocationState = { from?: string };

export function SignIn() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const { status, error, signIn, reset } = useSiwsSignIn();

  const fallback = (location.state as LocationState | null)?.from ?? "/console";

  useEffect(() => {
    if (isAuthenticated) navigate(fallback, { replace: true });
  }, [isAuthenticated, fallback, navigate]);

  const onPrimary = async () => {
    if (!wallet.connected) {
      walletModal.setVisible(true);
      return;
    }
    await signIn();
  };

  const primaryLabel = (() => {
    if (!wallet.connected) return "Connect wallet";
    if (status === "requesting-nonce") return "Requesting nonce…";
    if (status === "awaiting-signature") return "Confirm in wallet…";
    if (status === "verifying") return "Verifying…";
    return `Sign in with ${wallet.wallet?.adapter.name ?? "wallet"}`;
  })();

  const busy = status === "requesting-nonce" || status === "awaiting-signature" || status === "verifying";

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-bg px-6 py-12">
      <SignInAtmosphere />
      <div className="relative z-10 w-full max-w-[440px]">
        <div className="signin-card rounded-[22px] border border-white/[0.08] bg-surface/70 p-8 backdrop-blur-xl">
          <div className="mb-6 flex justify-center">
            <Brand to="/" />
          </div>
          <div className="mb-2 text-center font-mono text-[11.5px] tracking-[0.18em] text-mint-soft uppercase">
            Sign in · {config.solanaCluster}
          </div>
          <h1 className="m-0 mb-3 text-center text-[28px] leading-tight font-medium tracking-[-0.025em]">
            Sign in with your <em className="text-mint not-italic">Solana wallet</em>
          </h1>
          <p className="m-0 mb-7 text-center text-[14px] text-muted">
            Connect a wallet and sign a one-time message to access the operator console. No
            transaction. No fee. The signature proves you own the wallet.
          </p>

          <div className="grid gap-3">
            <WalletStatus
              connected={wallet.connected}
              walletName={wallet.wallet?.adapter.name ?? null}
              pubkey={wallet.publicKey?.toBase58() ?? null}
              onChange={() => {
                reset();
                walletModal.setVisible(true);
              }}
              onDisconnect={() => {
                reset();
                void wallet.disconnect();
              }}
            />
            <button
              type="button"
              onClick={onPrimary}
              disabled={busy}
              className="inline-flex h-12 items-center justify-center rounded-full bg-mint px-6 text-[15.5px] font-medium text-[#0a0b0c] transition-[background-color,opacity] hover:bg-[#ebf7f2] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {primaryLabel}
            </button>
            {error ? (
              <div className="rounded-[10px] border border-[#E0857733] bg-[#E0857714] px-3 py-2 text-center text-[12.5px] text-[#E08577]">
                {error}
              </div>
            ) : null}
          </div>

        </div>
        <div className="mt-6 text-center text-[12.5px] text-muted">
          <Link to="/" className="hover:text-fg">
            ← Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}

function SignInAtmosphere() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Slow conic wash that subtly rotates over a minute. */}
      <div className="signin-conic absolute -inset-1/4" />
      {/* Faint dot grid, masked to fade at the edges. */}
      <div className="signin-grid absolute inset-0" />
      {/* Three floating mint orbs at different sizes / speeds / phases. */}
      <div
        className="signin-orb top-[8%] left-[12%] h-[460px] w-[460px] bg-mint/20"
        style={{ animation: "signin-float-a 18s ease-in-out infinite" }}
      />
      <div
        className="signin-orb top-[55%] right-[8%] h-[380px] w-[380px] bg-mint/15"
        style={{ animation: "signin-float-b 22s ease-in-out infinite", animationDelay: "-6s" }}
      />
      <div
        className="signin-orb top-[30%] left-[55%] h-[300px] w-[300px] bg-mint-soft/15"
        style={{ animation: "signin-float-c 28s ease-in-out infinite", animationDelay: "-12s" }}
      />
      {/* Bottom horizon glow so the page doesn't dead-end into pure black. */}
      <div className="absolute right-0 bottom-0 left-0 h-[40%] bg-[radial-gradient(80%_60%_at_50%_100%,rgba(166,225,207,0.08),transparent_70%)]" />
    </div>
  );
}

type WalletStatusProps = {
  connected: boolean;
  walletName: string | null;
  pubkey: string | null;
  onChange: () => void;
  onDisconnect: () => void;
};

function WalletStatus({ connected, walletName, pubkey, onChange, onDisconnect }: WalletStatusProps) {
  if (!connected || !pubkey) {
    return (
      <div className="flex items-center justify-between rounded-[10px] border border-[var(--color-line)] bg-surface-2 px-4 py-3 text-[13px]">
        <span className="text-muted">No wallet connected</span>
        <button type="button" onClick={onChange} className="font-mono text-[12px] text-mint hover:text-fg">
          choose →
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between rounded-[10px] border border-[var(--color-line)] bg-surface-2 px-4 py-3 text-[13px]">
      <div className="grid">
        <span className="text-fg-2">{walletName}</span>
        <span className="font-mono text-[11.5px] text-muted">{shortPk(pubkey)}</span>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={onChange} className="font-mono text-[12px] text-muted hover:text-fg">
          change
        </button>
        <button type="button" onClick={onDisconnect} className="font-mono text-[12px] text-muted hover:text-fg">
          disconnect
        </button>
      </div>
    </div>
  );
}

function shortPk(pk: string): string {
  return pk.length > 12 ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : pk;
}
