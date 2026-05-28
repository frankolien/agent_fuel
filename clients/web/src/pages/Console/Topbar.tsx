import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAuth } from "@/app/auth";
import { formatSol, formatUsdc, useWalletBalances } from "@/lib/useWalletBalances";
import { CaretDownIcon, InboxIcon, MenuIcon, SearchIcon, SettingsIcon } from "./icons";
import { Ticker } from "./components/Ticker";
import { useFleetTicker } from "./useFleetTicker";

// Devnet test-USDC mint. Same constant the Vaults screen uses for the create
// flow. Lives here so the topbar can show the user's test-USDC balance even
// when they haven't opened any vault yet.
const DEFAULT_DEVNET_USDC_MINT = "GxAHHLN4qZtiHXKiTNFebXbbMWzgFBy4AGaiDJEY8xdf";

type Props = {
  onMenuClick?: () => void;
};

export function Topbar({ onMenuClick }: Props) {
  const ticker = useFleetTicker();
  return (
    // Mobile: hamburger + wallet only. md+: add search. xl+: add ticker.
    // The grid collapses to a simple flex layout under md so nothing overflows
    // the sidebar-less viewport.
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/[0.09] bg-[#0e0f11] px-3 sm:px-5 md:grid md:grid-cols-[1fr_auto] md:gap-4 md:px-[22px] xl:grid-cols-[380px_1fr_auto]">
      <button
        type="button"
        onClick={onMenuClick}
        title="Open menu"
        aria-label="Open navigation menu"
        className="grid h-8 w-8 place-items-center rounded-md border border-white/[0.09] bg-surface-2 text-fg-2 hover:text-fg md:hidden"
      >
        <MenuIcon />
      </button>

      <label className="hidden h-8 items-center gap-2 rounded-md border border-white/[0.09] bg-surface-2 px-2.5 text-muted md:flex">
        <SearchIcon />
        <input
          className="w-full min-w-0 flex-1 border-0 bg-transparent text-[12.5px] text-fg outline-none placeholder:text-muted"
          placeholder="Search agents, services, signatures, PDAs…"
        />
        <span className="hidden rounded-sm border border-white/[0.16] bg-surface-3 px-1.5 py-px font-mono text-[10px] text-muted lg:inline">
          ⌘K
        </span>
      </label>

      {/* Ticker is information-dense; below xl it overflows the topbar. */}
      <div className="hidden min-w-0 xl:block">
        <Ticker items={ticker} />
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          title="Inbox"
          className="relative hidden h-8 w-8 place-items-center rounded-md border border-transparent text-fg-2 hover:border-white/[0.09] hover:bg-surface-2 hover:text-fg sm:grid"
        >
          <InboxIcon />
          <span className="absolute top-1 right-1 grid h-[13px] min-w-[13px] place-items-center rounded-full bg-mint px-0.5 text-[9px] font-semibold text-[#0a0b0c]">
            3
          </span>
        </button>
        <button
          type="button"
          title="Settings"
          className="hidden h-8 w-8 place-items-center rounded-md border border-transparent text-fg-2 hover:border-white/[0.09] hover:bg-surface-2 hover:text-fg sm:grid"
        >
          <SettingsIcon />
        </button>
        <BalancesPill />
        <WalletMenu />
      </div>
    </header>
  );
}

function BalancesPill() {
  const { data, isLoading } = useWalletBalances(DEFAULT_DEVNET_USDC_MINT);
  if (isLoading && !data) {
    return (
      <div className="hidden h-8 items-center rounded-md border border-white/[0.09] bg-surface-2 px-2.5 font-mono text-[11px] text-muted sm:flex">
        …
      </div>
    );
  }
  if (!data) return null;
  return (
    <div
      title="Your wallet's devnet balances"
      className="hidden h-8 items-center gap-2 rounded-md border border-white/[0.09] bg-surface-2 px-2.5 font-mono text-[11px] sm:flex"
    >
      <span className="text-mint">{formatUsdc(data.usdcMicro)} USDC</span>
      <span className="text-muted-2">·</span>
      <span className="text-fg-2">{formatSol(data.solLamports, 3)} SOL</span>
    </div>
  );
}

function WalletMenu() {
  const { walletPubkey, signOut } = useAuth();
  const wallet = useWallet();
  const [open, setOpen] = useState(false);

  const display = walletPubkey ?? wallet.publicKey?.toBase58() ?? "—";
  const walletName = wallet.wallet?.adapter.name ?? "Wallet";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-2 rounded-md border border-white/[0.09] bg-surface-2 pr-2.5 pl-2 hover:bg-surface-3"
      >
        <span className="h-[7px] w-[7px] rounded-full bg-mint [box-shadow:0_0_10px_var(--color-mint-glow)]" />
        <span className="font-mono text-[11.5px]">{shortPk(display)}</span>
        <CaretDownIcon />
      </button>
      {open ? (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute top-full right-0 z-20 mt-2 w-[260px] rounded-[10px] border border-white/[0.09] bg-[#15171a] p-2 text-[12.5px] shadow-[0_12px_32px_-8px_rgba(0,0,0,0.7)]">
            <div className="grid gap-0.5 px-2 py-2">
              <span className="text-muted text-[11px] uppercase tracking-[0.06em] font-mono">
                {walletName}
              </span>
              <span className="font-mono text-fg-2 break-all">{display}</span>
            </div>
            <hr className="m-0 border-0 border-t border-white/[0.09]" />
            <button
              type="button"
              onClick={async () => {
                setOpen(false);
                await navigator.clipboard.writeText(display).catch(() => {});
              }}
              className="block w-full rounded-md px-2 py-1.5 text-left text-fg-2 hover:bg-surface-2 hover:text-fg"
            >
              Copy address
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                signOut();
              }}
              className="block w-full rounded-md px-2 py-1.5 text-left text-fg-2 hover:bg-surface-2 hover:text-fg"
            >
              Sign out
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function shortPk(pk: string): string {
  return pk.length > 12 ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : pk;
}
