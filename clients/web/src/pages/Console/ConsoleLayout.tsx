import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function ConsoleLayout() {
  // Mobile drawer state lives here so the hamburger (in Topbar) and the
  // sidebar's backdrop/close can share it without prop-drilling through a
  // store. Auto-close on route change matches what users expect.
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="console-bg flex h-screen text-[14px] md:grid md:grid-cols-[224px_1fr]">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <main className="grid h-screen min-w-0 flex-1 grid-rows-[56px_1fr]">
        <Topbar onMenuClick={() => setNavOpen(true)} />
        <div className="overflow-auto [scrollbar-color:var(--color-line-2)_transparent] [scrollbar-width:thin]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
