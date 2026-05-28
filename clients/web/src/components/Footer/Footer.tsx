import { Brand } from "@/components/Brand/Brand";

type Group = {
  heading: string;
  links: ReadonlyArray<{ label: string; href: string }>;
};

const GROUPS: ReadonlyArray<Group> = [
  {
    heading: "Protocol",
    links: [
      { label: "Reputation", href: "#reputation" },
      { label: "Credit Vaults", href: "#vaults" },
      { label: "Policies", href: "#policies" },
      { label: "x402 Flow", href: "#how" },
    ],
  },
  {
    heading: "Build",
    links: [
      { label: "SDK", href: "#sdk" },
      { label: "Docs", href: "#docs" },
      { label: "Console", href: "/console" },
      { label: "Whitepaper", href: "#" },
    ],
  },
  {
    heading: "Community",
    links: [
      { label: "GitHub", href: "https://github.com/frankolien/agent_fuel" },
      { label: "Discord", href: "#" },
      { label: "X / Twitter", href: "#" },
      { label: "Brand kit", href: "#" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Status", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
];

export function Footer() {
  return (
    <footer
      id="footer"
      className="mx-auto max-w-[var(--container-shell)] border-t border-[var(--color-line)] px-[var(--pad)] pt-12 pb-16"
    >
      <div className="grid grid-cols-2 items-start gap-6 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
        <div className="grid max-w-[280px] gap-3 col-span-2 md:col-span-1">
          <Brand size={20} />
          <p className="m-0 text-[13px] text-muted">
            The x402-native credit and reputation layer for autonomous AI agents on Solana.
          </p>
        </div>
        {GROUPS.map((group) => (
          <div key={group.heading}>
            <h4 className="mb-3.5 m-0 font-mono text-[11.5px] font-normal tracking-[0.16em] text-muted uppercase">
              {group.heading}
            </h4>
            <ul className="grid list-none gap-2.5 p-0 m-0">
              {group.links.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="text-sm text-fg-2 hover:text-mint">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-8 flex items-center justify-between font-mono text-[11px] tracking-[0.08em] text-muted uppercase">
        <span>© 2026 Agent Fuel Labs</span>
        <span>v0.4.1 · mainnet-beta</span>
      </div>
    </footer>
  );
}
