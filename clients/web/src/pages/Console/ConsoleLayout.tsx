import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function ConsoleLayout() {
  return (
    <div className="console-bg grid h-screen grid-cols-[224px_1fr] text-[14px]">
      <Sidebar />
      <main className="grid h-screen min-w-0 grid-rows-[56px_1fr]">
        <Topbar />
        <div className="overflow-auto [scrollbar-color:var(--color-line-2)_transparent] [scrollbar-width:thin]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
