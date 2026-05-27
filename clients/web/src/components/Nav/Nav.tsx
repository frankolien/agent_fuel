import { Link } from "react-router-dom";
import { Brand } from "@/components/Brand/Brand";
import { Pill } from "@/components/Pill/Pill";

const LINKS = [
  { label: "Protocol", href: "#protocol", route: false },
  { label: "How it works", href: "#how", route: false },
  { label: "SDK", href: "#sdk", route: false },
  { label: "Console", href: "/console", route: true },
  { label: "Docs", href: "#docs", route: false },
  { label: "Blog", href: "#blog", route: false },
] as const;

export function Nav() {
  return (
    <header>
      <nav className="mx-auto grid max-w-[var(--container-shell)] grid-cols-[auto_1fr_auto] items-center gap-6 px-[var(--pad)] py-6">
        <Brand />
        <div className="hidden items-center justify-center gap-7 text-sm text-fg-2 md:flex">
          {LINKS.map((link) =>
            link.route ? (
              <Link
                key={link.label}
                to={link.href}
                className="opacity-85 hover:text-fg hover:opacity-100"
              >
                {link.label}
              </Link>
            ) : (
              <a
                key={link.label}
                href={link.href}
                className="opacity-85 hover:text-fg hover:opacity-100"
              >
                {link.label}
              </a>
            ),
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <Pill href="#sdk" size="sm">
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
