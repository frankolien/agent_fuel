import { CaretDownIcon, InboxIcon, SearchIcon, SettingsIcon } from "./icons";

export function Topbar() {
  return (
    <header className="sticky top-0 z-10 grid grid-cols-[380px_1fr_auto] items-center gap-4 border-b border-white/[0.09] bg-[#0e0f11] px-[22px]">
      <label className="flex h-8 items-center gap-2 rounded-md border border-white/[0.09] bg-surface-2 px-2.5 text-muted">
        <SearchIcon />
        <input
          className="flex-1 border-0 bg-transparent text-[12.5px] text-fg outline-none placeholder:text-muted"
          placeholder="Search agents, services, signatures, PDAs…"
        />
        <span className="rounded-sm border border-white/[0.16] bg-surface-3 px-1.5 py-px font-mono text-[10px] text-muted">
          ⌘K
        </span>
      </label>

      {/* Ticker slot — will host the live event marquee in slice 4.W.8. */}
      <div />

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          title="Inbox"
          className="relative grid h-8 w-8 place-items-center rounded-md border border-transparent text-fg-2 hover:border-white/[0.09] hover:bg-surface-2 hover:text-fg"
        >
          <InboxIcon />
          <span className="absolute top-1 right-1 grid h-[13px] min-w-[13px] place-items-center rounded-full bg-mint px-0.5 text-[9px] font-semibold text-[#0a0b0c]">
            3
          </span>
        </button>
        <button
          type="button"
          title="Settings"
          className="grid h-8 w-8 place-items-center rounded-md border border-transparent text-fg-2 hover:border-white/[0.09] hover:bg-surface-2 hover:text-fg"
        >
          <SettingsIcon />
        </button>
        <div className="flex h-8 items-center gap-2 rounded-md border border-white/[0.09] bg-surface-2 pr-2.5 pl-2">
          <span className="h-[7px] w-[7px] rounded-full bg-mint [box-shadow:0_0_10px_var(--color-mint-glow)]" />
          <span className="font-mono text-[11.5px]">8Fk9…rT3w</span>
          <CaretDownIcon />
        </div>
      </div>
    </header>
  );
}
