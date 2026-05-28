import { NavLink } from "react-router-dom";
import { CONSOLE_NAV } from "./nav";
import { CaretDownIcon } from "./icons";

type Props = {
  /** Mobile drawer state — ignored on `md+` where the sidebar is always docked. */
  open?: boolean;
  onClose?: () => void;
};

export function Sidebar({ open = false, onClose }: Props) {
  return (
    <>
      {/* Mobile-only backdrop. Click anywhere outside the drawer to dismiss. */}
      <div
        className={
          "fixed inset-0 z-30 bg-black/60 backdrop-blur-sm transition-opacity duration-200 md:hidden " +
          (open ? "opacity-100" : "pointer-events-none opacity-0")
        }
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={
          "fixed inset-y-0 left-0 z-40 grid w-[260px] grid-rows-[auto_auto_1fr_auto] gap-3 border-r border-white/[0.09] bg-[#0e0f11] px-3 py-3.5 pl-3.5 transition-transform duration-200 ease-out md:static md:w-auto md:translate-x-0 " +
          (open ? "translate-x-0" : "-translate-x-full md:translate-x-0")
        }
      >
        <div className="flex items-center gap-2.5 px-1.5 py-1">
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
            <defs>
              <linearGradient id="brand-g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--color-mint)" />
                <stop offset="1" stopColor="#6FA493" />
              </linearGradient>
            </defs>
            <path d="M4 14 L11 3 L18 14 H14.5 L11 9 L7.5 14 Z" fill="url(#brand-g)" />
            <path
              d="M7.2 16 H14.8"
              stroke="var(--color-mint)"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <circle cx="11" cy="19" r="0.8" fill="var(--color-mint)" />
          </svg>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-[-0.01em]">Agent Fuel</div>
            <div className="font-mono text-[11px] text-muted">mainnet-beta</div>
          </div>
        </div>

        <div className="rounded-[10px] border border-white/[0.09] bg-surface-2 px-2.5 py-2">
          <div className="grid grid-cols-[28px_1fr_12px] items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-md border border-white/[0.16] bg-surface-3 font-mono text-[11px] text-mint">
              VR
            </div>
            <div className="min-w-0">
              <div className="text-[12.5px]">Vega Research</div>
              <div className="text-[11px] text-muted">6 agents · 4 vaults</div>
            </div>
            <CaretDownIcon />
          </div>
        </div>

        <nav className="flex flex-col gap-px py-1">
          {CONSOLE_NAV.map((item) => {
            const Icon = item.Icon;
            return (
              <NavLink
                key={item.key}
                to={item.path}
                end={item.path === "/console"}
                className={({ isActive }) =>
                  "relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-[background-color,color] duration-100 ease-out " +
                  (isActive
                    ? "bg-surface-2 text-fg before:absolute before:top-2 before:bottom-2 before:-left-2 before:w-[2px] before:rounded-[2px] before:bg-mint before:content-['']"
                    : "text-fg-2 hover:bg-surface-2 hover:text-fg")
                }
              >
                <Icon />
                <span>{item.label}</span>
                {item.hasPulse ? <span className="nav-pulse ml-auto" /> : null}
              </NavLink>
            );
          })}
        </nav>

        <div className="grid gap-2">
          <div className="grid gap-1 rounded-[10px] border border-white/[0.09] bg-surface-2 px-2.5 py-2 text-[11px]">
            <div className="flex justify-between">
              <span className="text-muted">RPC</span>
              <span className="font-mono">helius · us-east</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">slot</span>
              <span className="font-mono">—</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">ws latency</span>
              <span className="font-mono">
                <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-mint align-[1px]" />
                —
              </span>
            </div>
          </div>
          <div className="px-1 font-mono text-[11px] text-muted">
            v0.4.1 ·{" "}
            <a href="#" className="hover:text-fg">
              status
            </a>
          </div>
        </div>
      </aside>
    </>
  );
}
