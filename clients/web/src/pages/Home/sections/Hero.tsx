import { Pill } from "@/components/Pill/Pill";

type FeedEntry = {
  label: string;
  amount: string;
  inbound?: boolean;
};

const FEED: ReadonlyArray<FeedEntry> = [
  { label: "spend → Pyth", amount: "$0.0042" },
  { label: "spend → HelixData", amount: "$0.0188" },
  { label: "claim ← Cortex", amount: "$14.22", inbound: true },
];

export function Hero() {
  return (
    <section className="relative mx-auto mt-2 max-w-[var(--container-shell)] px-[var(--pad)]">
      <div className="relative grid min-h-[600px] grid-cols-1 items-center gap-[clamp(24px,4vw,56px)] overflow-hidden px-0 py-10 md:grid-cols-[1fr_1.15fr] md:px-[clamp(32px,5vw,80px)] md:py-[clamp(48px,7vw,96px)]">
        <div className="min-w-0">
          <div className="mb-6 inline-flex items-center gap-2.5 font-mono text-[11.5px] tracking-[0.18em] text-mint-soft uppercase before:block before:h-1.5 before:w-1.5 before:rounded-full before:bg-mint before:[box-shadow:0_0_12px_var(--color-mint-glow)] before:content-['']">
            x402-native · built on Solana
          </div>
          <h1 className="m-0 mb-6 text-[clamp(36px,8vw,92px)] leading-[1.05] font-medium tracking-[-0.035em] text-balance text-fg md:mb-7 md:leading-[1.02]">
            Credit and reputation for{" "}
            <em className="text-glow-mint-xl text-mint not-italic">autonomous AI&nbsp;agents</em>.
          </h1>
          <p className="m-0 mb-8 max-w-[480px] text-[15.5px] leading-[1.55] text-muted md:mb-9 md:text-[17px]">
            Agent Fuel is the on-chain credit and reputation layer for the x402 agentic economy.
            Fund agent vaults with USDC, set granular spending policies, and let trusted agents
            transact on credit.
          </p>
          <div className="flex flex-wrap items-center gap-2.5 md:gap-3">
            <Pill
              to="/console"
              variant="solid"
              size="md"
              className="md:h-12 md:px-[26px] md:text-[15.5px]"
            >
              Launch app
            </Pill>
            <Pill href="#sdk" size="md" className="md:h-12 md:px-[26px] md:text-[15.5px]">
              Read the docs <span className="font-mono">↗</span>
            </Pill>
            <Pill
              href="#how"
              variant="glow"
              size="md"
              className="md:h-12 md:px-[26px] md:text-[15.5px]"
            >
              How it works
            </Pill>
          </div>
        </div>
        <div className="hero-art-halo relative min-w-0 w-full max-w-[620px] justify-self-end">
          <ReputationViz feed={FEED} />
        </div>
      </div>
    </section>
  );
}

function ReputationViz({ feed }: { feed: ReadonlyArray<FeedEntry> }) {
  return (
    <div
      aria-hidden="true"
      className="relative grid h-full min-h-[480px] w-full place-items-center"
    >
      <div className="viz-halo pointer-events-none absolute -inset-[10%]" />
      <div className="viz-card relative grid w-full max-w-[540px] gap-[18px] rounded-[22px] border border-white/14 px-[22px] pt-[22px] pb-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
          <div className="inline-flex items-center gap-2 text-xs whitespace-nowrap text-fg">
            <span className="h-1.5 w-1.5 rounded-full bg-mint [box-shadow:0_0_8px_var(--color-mint-glow)]" />
            <span className="font-mono">atlas-mm-01</span>
          </div>
          <span className="font-mono text-[10.5px] tracking-[0.12em] whitespace-nowrap text-muted uppercase">
            mainnet-beta
          </span>
        </div>

        <div className="relative mx-auto mt-1 aspect-square w-[220px] max-md:w-[180px]">
          <svg
            className="absolute inset-0 block h-full w-full"
            viewBox="0 0 220 220"
            preserveAspectRatio="xMidYMid meet"
          >
            <path
              d="M 32 158 A 90 90 0 1 1 188 158"
              stroke="rgba(255,255,255,0.10)"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M 32 158 A 90 90 0 1 1 184 156"
              stroke="var(--color-mint)"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              style={{ filter: "drop-shadow(0 0 14px var(--color-mint-glow))" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pt-[22px] pb-[38px] text-center">
            <div className="font-mono text-[9.5px] tracking-[0.2em] whitespace-nowrap text-muted">
              REPUTATION
            </div>
            <div className="text-glow-mint text-[60px] leading-none font-medium tracking-[-0.03em] text-mint max-md:text-[44px]">
              <span className="font-mono">947</span>
            </div>
            <div className="font-mono text-[9.5px] tracking-[0.2em] whitespace-nowrap text-mint-soft">
              ELITE · +12 / 24h
            </div>
          </div>
        </div>

        <div className="grid gap-2 rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3.5">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[10px] tracking-[0.16em] whitespace-nowrap text-muted">
              VAULT BALANCE
            </span>
            <span className="font-mono text-[13px] whitespace-nowrap text-fg">
              $1,872.58 <span className="text-[11.5px] text-muted">/ $5,000</span>
            </span>
          </div>
          <div className="relative h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="absolute inset-y-0 left-0 w-[37.5%] rounded-full bg-linear-to-r from-mint-soft to-mint [box-shadow:0_0_12px_var(--color-mint-glow)]" />
            <div className="absolute -top-0.5 -bottom-0.5 left-[48%] w-[1.5px] bg-mint [box-shadow:0_0_6px_var(--color-mint-glow)]" />
          </div>
          <div className="font-mono text-[10.5px] tracking-[0.04em] text-muted">
            62% remaining · 8 services whitelisted
          </div>
        </div>

        <div className="grid gap-2.5 px-1">
          {feed.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-[8px_1fr_auto] items-center gap-2.5 text-xs"
            >
              <span
                className={
                  row.inbound
                    ? "h-1.5 w-1.5 rounded-full bg-white/40"
                    : "h-1.5 w-1.5 rounded-full bg-mint [box-shadow:0_0_6px_var(--color-mint-glow)]"
                }
              />
              <span className="font-mono text-fg-2">{row.label}</span>
              <span className="font-mono text-mint">{row.amount}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
