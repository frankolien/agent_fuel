import { Link } from "react-router-dom";
import { Nav } from "@/components/Nav/Nav";
import { Footer } from "@/components/Footer/Footer";
import { Pill } from "@/components/Pill/Pill";
import { SectionHeading } from "@/components/SectionHeading/SectionHeading";
import { STEPS } from "@/pages/Home/content";

type PolicyCheck = {
  name: string;
  body: string;
};

const POLICY_CHECKS: ReadonlyArray<PolicyCheck> = [
  {
    name: "freeze",
    body: "If the vault is frozen, every spend reverts before any state changes. Owners can pause an agent instantly without revoking keys.",
  },
  {
    name: "zero-amount",
    body: "Zero-value spends are rejected up front — saves a wasted CPI and keeps the activity log clean.",
  },
  {
    name: "whitelist",
    body: "Optional. When set, only services on the whitelist can receive transfers. Lets owners scope an agent to a narrow set of providers.",
  },
  {
    name: "per-tx cap",
    body: "Hard ceiling on a single transfer. A compromised agent can't drain the vault in one shot.",
  },
  {
    name: "rolling-hour cap",
    body: "A 9 000-slot window (~60 min on Solana). Caps burst spending without locking the agent out for a full day.",
  },
  {
    name: "lifetime cap",
    body: "Total USDC the agent can ever spend from this vault. Owners renew by raising the cap or topping up.",
  },
];

type Program = {
  name: string;
  pubkey: string;
  body: string;
};

const PROGRAMS: ReadonlyArray<Program> = [
  {
    name: "credit_vault",
    pubkey: "EsykPsaf…E4jFXDg",
    body: "Holds the USDC and the policy account. Every spend goes through the six-check ladder before a PDA-signed transfer reaches the service's token account. Emits a typed SpendEvent the indexer consumes.",
  },
  {
    name: "reputation",
    pubkey: "4GjB4xdm…tiFShvQ",
    body: "Append-only feedback ledger plus a derived score. ERC-8004-compatible shape so reputation can be ported across protocols later. Owners and services can submit feedback; the scoring engine recomputes off-chain and writes the result back on-chain.",
  },
];

export function HowItWorks() {
  return (
    <>
      <div className="bg-fx" aria-hidden="true" />
      <Nav />
      <main className="animate-page-in relative z-[1]">
        <Hero />
        <Steps />
        <PolicyLadder />
        <Programs />
        <Cta />
        <Footer />
      </main>
    </>
  );
}

function Hero() {
  return (
    <section className="pt-[40px] pb-[80px]">
      <div className="mx-auto max-w-[var(--container-shell)] px-[var(--pad)]">
        <div className="mb-4 font-mono text-[11.5px] tracking-[0.18em] text-mint-soft uppercase">
          x402 Integration
        </div>
        <h1 className="m-0 max-w-[920px] text-[clamp(44px,5vw,72px)] leading-[1.02] font-medium tracking-[-0.03em] text-balance">
          A paid request, end to end.
        </h1>
        <p className="mt-6 max-w-[680px] text-[17px] leading-relaxed text-muted text-pretty">
          The agent SDK intercepts every <span className="text-fg">402</span> response and turns it
          into a policy-checked, on-chain spend — without changing your agent's logic. Four steps on
          the wire, six checks in the program, one signature on chain.
        </p>
      </div>
    </section>
  );
}

function Steps() {
  return (
    <section className="pb-[100px]">
      <SectionHeading
        eyebrow="The flow"
        title={
          <>
            Four steps. <em>One signature.</em>
          </>
        }
        lede="The SDK and the credit_vault program split the work: the SDK runs a pre-flight, the program runs the truth."
      />
      <div className="mx-auto grid max-w-[var(--container-shell)] grid-cols-1 gap-3.5 px-[var(--pad)] md:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step) => (
          <article
            key={step.num}
            className="relative grid gap-3 rounded-[18px] border border-[var(--color-line)] bg-surface px-6 py-[26px]"
          >
            <div className="font-mono text-xs tracking-[0.16em] text-mint">{step.num}</div>
            <h3 className="m-0 text-[19px] leading-[1.25] font-medium tracking-[-0.015em]">
              {step.title.lead}
              {step.title.mono ? <span className="font-mono">{step.title.mono}</span> : null}
              {step.title.tail}
            </h3>
            <p className="m-0 text-sm text-muted">{step.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function PolicyLadder() {
  return (
    <section className="pb-[100px]">
      <SectionHeading
        eyebrow="The six checks"
        title={
          <>
            Every spend, <em>six gates.</em>
          </>
        }
        lede="The same ladder runs in the SDK (pre-flight) and inside credit_vault (truth). If any gate rejects, no USDC moves and no counters update."
      />
      <div className="mx-auto grid max-w-[var(--container-shell)] grid-cols-1 gap-3.5 px-[var(--pad)] md:grid-cols-2 lg:grid-cols-3">
        {POLICY_CHECKS.map((check, i) => (
          <article
            key={check.name}
            className="grid gap-2.5 rounded-[18px] border border-[var(--color-line)] bg-surface px-6 py-[24px]"
          >
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs tracking-[0.16em] text-mint-soft">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="font-mono text-[15px] text-mint">{check.name}</span>
            </div>
            <p className="m-0 text-sm leading-relaxed text-fg-2">{check.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Programs() {
  return (
    <section className="pb-[100px]">
      <SectionHeading
        eyebrow="On-chain"
        title={
          <>
            Two programs. <em>One protocol.</em>
          </>
        }
        lede="Both deployed to devnet today. Mainnet in Phase 5."
      />
      <div className="mx-auto grid max-w-[var(--container-shell)] grid-cols-1 gap-4 px-[var(--pad)] md:grid-cols-2">
        {PROGRAMS.map((p) => (
          <article
            key={p.name}
            className="grid gap-4 rounded-[18px] border border-[var(--color-line)] bg-surface px-7 py-7"
          >
            <div className="flex items-center justify-between gap-4">
              <h3 className="m-0 font-mono text-[20px] font-medium text-mint">{p.name}</h3>
              <span className="font-mono text-[12px] text-muted-2">{p.pubkey}</span>
            </div>
            <p className="m-0 text-[14.5px] leading-relaxed text-fg-2">{p.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section className="pb-[140px]">
      <div className="mx-auto max-w-[var(--container-shell)] px-[var(--pad)]">
        <div className="grid gap-6 rounded-[24px] border border-[var(--color-line)] bg-surface px-8 py-12 md:grid-cols-[1.5fr_auto] md:items-center">
          <div>
            <div className="mb-3 font-mono text-[11.5px] tracking-[0.18em] text-mint-soft uppercase">
              Build with it
            </div>
            <h3 className="m-0 max-w-[640px] text-[28px] leading-[1.1] font-medium tracking-[-0.02em]">
              Six functions, one import. Read the SDK docs and ship a paid agent today.
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Pill to="/docs" variant="solid">
              Read the docs
            </Pill>
            <Link
              to="/console"
              className="rounded-full border border-[var(--color-line-2)] px-5 py-2.5 text-sm font-medium text-fg hover:bg-surface-2"
            >
              Launch Console
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
