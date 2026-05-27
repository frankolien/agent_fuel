import { Link } from "react-router-dom";
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
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-bg/70 backdrop-blur-lg">
      <nav className="mx-auto grid max-w-[var(--container-shell)] grid-cols-[auto_1fr_auto] items-center gap-6 px-[var(--pad)] py-4">
        <Brand />
        <div className="hidden items-center justify-center gap-7 text-sm text-fg-2 md:flex">
          {LINKS.map((link) =>
            link.kind === "external" ? (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="opacity-85 hover:text-fg hover:opacity-100"
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.label}
                to={link.href}
                className="opacity-85 hover:text-fg hover:opacity-100"
              >
                {link.label}
              </Link>
            ),
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <Pill to="/docs" size="sm">
            Read the docs
          </Pill>
          <Pill to="/console" variant="solid" size="sm">
            Launch App
          </Pill>
        </div>
      </nav>
    </header>
  );
}
