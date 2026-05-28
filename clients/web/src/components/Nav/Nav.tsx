import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Brand } from "@/components/Brand/Brand";
import { Pill } from "@/components/Pill/Pill";

const GITHUB_URL = "https://github.com/frankolien/agent_fuel";

const LINKS = [
  { label: "Protocol", href: "/#protocol", kind: "route" },
  { label: "How it works", href: "/how-it-works", kind: "route" },
  { label: "SDK", href: "/#sdk", kind: "route" },
  { label: "Console", href: "/console", kind: "route" },
  { label: "Docs", href: "/docs", kind: "route" },
  { label: "GitHub", href: GITHUB_URL, kind: "external" },
] as const;

export function Nav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  // Close on navigation so tapping a link doesn't leave the panel hanging.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.hash]);

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-bg/70 backdrop-blur-lg">
      <nav className="mx-auto grid max-w-[var(--container-shell)] grid-cols-[auto_1fr_auto] items-center gap-4 px-[var(--pad)] py-4 sm:gap-6">
        <Brand />
        <div className="hidden items-center justify-center gap-7 text-sm text-fg-2 md:flex">
          {LINKS.map((link) => renderLink(link, "opacity-85 hover:text-fg hover:opacity-100"))}
        </div>
        <div className="flex items-center gap-2">
          <Pill to="/docs" size="sm" className="hidden sm:inline-flex">
            Read the docs
          </Pill>
          <Pill to="/console" variant="solid" size="sm">
            Launch App
          </Pill>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="ml-1 grid h-9 w-9 place-items-center rounded-md border border-[var(--color-line)] bg-bg/40 text-fg-2 hover:text-fg md:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              {open ? (
                <path
                  d="M3 3 L13 13 M13 3 L3 13"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M2 4 H14 M2 8 H14 M2 12 H14"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile dropdown. Renders inside the same sticky header so it lives in
          the document flow on open and disappears completely when closed —
          avoids layered overlay z-index fights with sticky cards downstream. */}
      <div
        className={
          "overflow-hidden border-t border-[var(--color-line)] bg-bg/95 backdrop-blur-lg transition-[max-height,opacity] duration-200 md:hidden " +
          (open ? "max-h-[420px] opacity-100" : "max-h-0 opacity-0")
        }
      >
        <div className="mx-auto grid max-w-[var(--container-shell)] gap-px px-[var(--pad)] py-3">
          {LINKS.map((link) =>
            renderLink(
              link,
              "block rounded-md px-3 py-2.5 text-[14px] text-fg-2 hover:bg-surface-2 hover:text-fg",
            ),
          )}
        </div>
      </div>
    </header>
  );
}

type LinkSpec = (typeof LINKS)[number];

function renderLink(link: LinkSpec, className: string) {
  if (link.kind === "external") {
    return (
      <a
        key={link.label}
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {link.label}
      </a>
    );
  }
  return (
    <Link key={link.label} to={link.href} className={className}>
      {link.label}
    </Link>
  );
}
