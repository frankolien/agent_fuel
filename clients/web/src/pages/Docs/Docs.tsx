import { useEffect, useMemo, useRef, useState } from "react";
import { Nav } from "@/components/Nav/Nav";
import { Footer } from "@/components/Footer/Footer";
import { CodeBlock, type Lang } from "@/components/CodeBlock/CodeBlock";
import { cn } from "@/lib/cn";

type Sub = { id: string; title: string };
type Section = { id: string; title: string; subs: Sub[] };

const TOC: Section[] = [
  { id: "install", title: "Install", subs: [] },
  {
    id: "quick-start",
    title: "Quick start",
    subs: [
      { id: "constructor", title: "Constructor" },
      { id: "owner-option", title: "Owner option" },
    ],
  },
  {
    id: "sdk",
    title: "The six functions",
    subs: [
      { id: "fn-spend", title: "spend()" },
      { id: "fn-get-score", title: "getScore()" },
      { id: "fn-get-vault-balance", title: "getVaultBalance()" },
      { id: "fn-get-policy", title: "getPolicy()" },
      { id: "fn-check-service", title: "checkService()" },
      { id: "fn-on-event", title: "onEvent()" },
    ],
  },
  { id: "x402", title: "Paying with x402", subs: [] },
  { id: "errors", title: "Error reference", subs: [] },
  { id: "program-ids", title: "Program IDs & IDL", subs: [] },
];

export function Docs() {
  const allIds = useMemo(() => TOC.flatMap((s) => [s.id, ...s.subs.map((sub) => sub.id)]), []);
  const [active, setActive] = useState<string>(allIds[0] ?? "");
  const visibleRef = useRef(new Set<string>());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visibleRef.current.add(e.target.id);
          else visibleRef.current.delete(e.target.id);
        }
        const firstVisible = allIds.find((id) => visibleRef.current.has(id));
        if (firstVisible) setActive(firstVisible);
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 },
    );
    for (const id of allIds) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [allIds]);

  return (
    <>
      <div className="bg-fx" aria-hidden="true" />
      <Nav />
      <main className="animate-page-in relative z-[1]">
        <div className="mx-auto grid max-w-[var(--container-shell)] gap-10 px-[var(--pad)] py-12 md:grid-cols-[260px_1fr]">
          <Sidebar active={active} />
          <article className="min-w-0 [&_h2]:scroll-mt-24 [&_h3]:scroll-mt-24 [&_h4]:scroll-mt-24">
            <header className="mb-12">
              <div className="mb-3 font-mono text-[11.5px] tracking-[0.18em] text-mint-soft uppercase">
                Agent Fuel SDK
              </div>
              <h1 className="m-0 text-[44px] leading-[1.05] font-medium tracking-[-0.025em]">
                Docs
              </h1>
              <p className="mt-4 max-w-[640px] text-[15.5px] leading-relaxed text-muted">
                TypeScript SDK for Agent Fuel — credit vault + reputation primitives for AI agents
                on Solana. Six functions, one import, on-chain payments via x402.
              </p>
            </header>

            <Install />
            <QuickStart />
            <SdkFunctions />
            <X402 />
            <Errors />
            <ProgramIds />
          </article>
        </div>
        <Footer />
      </main>
    </>
  );
}

// ---------- Sidebar ----------

function Sidebar({ active }: { active: string }) {
  return (
    <aside className="hidden md:block">
      <nav className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2">
        <div className="mb-3 font-mono text-[11px] tracking-[0.18em] text-muted-2 uppercase">
          On this page
        </div>
        <ul className="m-0 list-none p-0 text-[13.5px]">
          {TOC.map((s) => (
            <li key={s.id} className="py-0.5">
              <TocLink id={s.id} title={s.title} active={active} />
              {s.subs.length > 0 && (
                <ul className="m-0 mt-1 mb-2 list-none border-l border-[var(--color-line)] pl-3">
                  {s.subs.map((sub) => (
                    <li key={sub.id} className="py-0.5">
                      <TocLink id={sub.id} title={sub.title} active={active} sub />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

function TocLink({
  id,
  title,
  active,
  sub = false,
}: {
  id: string;
  title: string;
  active: string;
  sub?: boolean;
}) {
  const isActive = active === id;
  return (
    <a
      href={`#${id}`}
      className={cn(
        "block transition-colors",
        sub ? "text-[12.5px]" : "font-medium",
        isActive ? "text-mint" : "text-muted hover:text-fg",
      )}
    >
      {title}
    </a>
  );
}

// ---------- Section primitives ----------

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="mt-16 mb-4 text-[28px] leading-tight font-medium tracking-[-0.02em] first:mt-0"
    >
      {children}
    </h2>
  );
}

function H3({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="mt-10 mb-3 font-mono text-[18px] font-medium text-mint-soft">
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="my-4 text-[15px] leading-relaxed text-fg-2">{children}</p>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[13px] text-mint-soft">
      {children}
    </code>
  );
}

function Pre({ children, lang = "ts" }: { children: string; lang?: Lang }) {
  return (
    <div className="my-5">
      <CodeBlock lang={lang}>{children}</CodeBlock>
    </div>
  );
}

function Callout({ kind, children }: { kind: "note" | "warn"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "my-5 rounded-[12px] border px-4 py-3 text-[14px]",
        kind === "note"
          ? "border-[var(--color-mint-glow-2)] bg-[var(--color-mint-glow-2)] text-fg-2"
          : "border-[var(--color-syntax-string)]/30 bg-[var(--color-syntax-string)]/10 text-fg-2",
      )}
    >
      {children}
    </div>
  );
}

function Table({ rows }: { rows: [string, string][] }) {
  return (
    <div className="my-5 overflow-hidden rounded-[12px] border border-[var(--color-line)]">
      <table className="w-full border-collapse text-[13.5px]">
        <tbody>
          {rows.map(([k, v], i) => (
            <tr
              key={k}
              className={i % 2 === 0 ? "bg-surface" : "bg-surface-2"}
            >
              <td className="border-r border-[var(--color-line)] px-4 py-2.5 align-top font-mono text-mint-soft whitespace-nowrap">
                {k}
              </td>
              <td className="px-4 py-2.5 text-fg-2">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Sections ----------

function Install() {
  return (
    <section>
      <H2 id="install">Install</H2>
      <P>
        The SDK ships as <Code>@agent-fuel/sdk</Code> on npm with provenance. <Code>@solana/web3.js</Code>{" "}
        and <Code>@coral-xyz/anchor</Code> are peer dependencies — pin them yourself so your bot and
        the SDK share the same RPC client.
      </P>
      <Pre lang="bash">{`npm install @agent-fuel/sdk @solana/web3.js @coral-xyz/anchor`}</Pre>
    </section>
  );
}

function QuickStart() {
  return (
    <section>
      <H2 id="quick-start">Quick start</H2>

      <H3 id="constructor">Constructor</H3>
      <P>
        Construct an <Code>AgentFuel</Code> instance with the agent keypair, the cluster, and an RPC
        endpoint. <Code>apiBase</Code> points at the Agent Fuel backend (REST + WebSocket).
      </P>
      <Pre>{`import { Keypair, PublicKey } from "@solana/web3.js";
import { AgentFuel } from "@agent-fuel/sdk";

const agent = Keypair.generate(); // load yours from a keystore

const fuel = new AgentFuel({
  agent,
  owner: new PublicKey("..."),               // the wallet that funded your vault
  cluster: "devnet",
  rpc: "https://api.devnet.solana.com",
  apiBase: "https://api.agentfuel.online",
});`}</Pre>

      <H3 id="owner-option">Owner option</H3>
      <P>
        <Code>owner</Code> is optional. When you pass it on the constructor, the agent-side methods{" "}
        (<Code>getVaultBalance</Code>, <Code>getPolicy</Code>, <Code>spend</Code>) default to your
        own vault — call them with no arguments. Pass <Code>owner</Code> per call only when
        inspecting someone else's vault.
      </P>
      <Callout kind="note">
        Calling a method that needs the owner without configuring one anywhere throws{" "}
        <Code>OwnerNotConfiguredError</Code>.
      </Callout>
    </section>
  );
}

function SdkFunctions() {
  return (
    <section>
      <H2 id="sdk">The six functions</H2>
      <P>
        The full surface of the SDK is six methods plus one fetch wrapper for x402. Every method
        throws <Code>AccountNotFoundError</Code> when the target doesn't exist on-chain (or the
        backend returns 404), and <Code>HttpError</Code> for non-2xx REST responses.
      </P>

      <H3 id="fn-spend">spend()</H3>
      <P>
        Pay a service from the agent's vault. The SDK fetches the current vault + policy and applies
        the same six-check ladder the on-chain program enforces — any failure surfaces as a typed
        error so callers can branch without parsing strings. The service's USDC associated token
        account is created on-demand (~0.002 SOL rent, paid by the agent).
      </P>
      <Pre>{`const { signature } = await fuel.spend({
  service: serviceAuthorityPubkey,
  amountUsdc: 250_000, // micro-USDC (0.25 USDC)
});`}</Pre>

      <H3 id="fn-get-score">getScore()</H3>
      <P>
        Public reputation snapshot via REST — no auth needed. Score is <Code>null</Code> for
        unscored agents.
      </P>
      <Pre>{`const score = await fuel.getScore();              // your own agent
const other = await fuel.getScore(otherAgentPubkey);`}</Pre>

      <H3 id="fn-get-vault-balance">getVaultBalance()</H3>
      <P>
        On-chain credit-vault state with a derived <Code>balance</Code> field. Defaults to the
        agent's own vault when <Code>owner</Code> was passed to the constructor.
      </P>
      <Pre>{`const vault = await fuel.getVaultBalance();
console.log(vault.balance, vault.frozen);

const other = await fuel.getVaultBalance({
  owner: otherOwner,
  agent: otherAgent,
});`}</Pre>

      <H3 id="fn-get-policy">getPolicy()</H3>
      <P>
        On-chain spend policy — per-transaction, hourly, and lifetime caps, the optional whitelist,
        and the freeze flag.
      </P>
      <Pre>{`const policy = await fuel.getPolicy();
console.log(policy.per_tx_limit_usdc, policy.hourly_limit_usdc);`}</Pre>

      <H3 id="fn-check-service">checkService()</H3>
      <P>Service-registry lookup by the registering wallet's pubkey.</P>
      <Pre>{`const service = await fuel.checkService(serviceAuthorityPubkey);`}</Pre>

      <H3 id="fn-on-event">onEvent()</H3>
      <P>
        WebSocket stream of events for an agent. Opens a connection to{" "}
        <Code>/ws/agents/:pk</Code> on the configured <Code>apiBase</Code>, parses each JSON frame
        into a typed <Code>LiveEventFrame</Code>, and fires the callback for every event the backend
        broadcasts. Exponential backoff (1 s → 2 s → … → 30 s cap); the subscription survives
        transient network failures until <Code>sub.close()</Code> is called.
      </P>
      <Pre>{`const sub = fuel.onEvent(
  (frame) => {
    // frame.event_name: Spent | Claimed | ScoreComputed | Deposited | ...
    console.log(frame.event_name, frame.payload);
  },
  { onStatus: (s) => console.log("ws:", s) },
);

// later
sub.close();`}</Pre>
      <Callout kind="note">
        Runtime: the SDK prefers <Code>globalThis.WebSocket</Code> (browsers, Node 22+) and falls
        back to the <Code>ws</Code> package for older Node, resolved lazily so browser bundlers
        don't pull it in.
      </Callout>
    </section>
  );
}

function X402() {
  return (
    <section>
      <H2 id="x402">Paying with x402</H2>
      <P>
        <Code>paymentRequired(fuel, options?)</Code> returns a <Code>fetch</Code>-shaped function
        that transparently handles HTTP 402:
      </P>
      <Pre>{`import { paymentRequired } from "@agent-fuel/sdk";

const fetchWithPayments = paymentRequired(fuel, {
  onPaymentRequired: (req) => console.log("paying", req.amountUsdc, "to", req.recipient),
  onPaid: (sig) => console.log("signature:", sig),
});

const res = await fetchWithPayments("https://data.example/feed");
const body = await res.json();`}</Pre>
      <P>The flow:</P>
      <ol className="my-4 list-decimal space-y-1.5 pl-6 text-[14.5px] text-fg-2">
        <li>The wrapped request runs.</li>
        <li>
          If the response is <Code>402</Code>, the SDK parses the <Code>X-Payment-Required</Code>{" "}
          header (JSON; or the response body as a fallback) for <Code>recipient</Code> and{" "}
          <Code>amountUsdc</Code>. <Code>payTo</Code> / <Code>maxAmountRequired</Code> are accepted
          as aliases for x402-spec servers.
        </li>
        <li>
          <Code>fuel.spend()</Code> is called with those values — all six policy guardrails apply,
          any failure throws the matching <Code>SpendPolicyError</Code> and the request is{" "}
          <em>not</em> retried.
        </li>
        <li>
          The original request is retried once with <Code>X-Payment: {"<signature>"}</Code>.
        </li>
      </ol>
      <Callout kind="warn">
        A second <Code>402</Code> propagates to the caller (no infinite loop). Malformed payment
        payloads throw <Code>PaymentParseError</Code>.
      </Callout>
    </section>
  );
}

function Errors() {
  return (
    <section>
      <H2 id="errors">Error reference</H2>
      <P>
        Every policy check has a dedicated subclass of <Code>SpendPolicyError</Code> — catch the
        base type for one branch, or catch the specific subtype for tailored handling. Chain-side
        failures (concurrent spend, window roll-over) map to the same types so the caller doesn't
        need to know whether the rejection came from the pre-flight or the program.
      </P>
      <Table
        rows={[
          ["VaultFrozenError", "vault.frozen === true"],
          ["ZeroAmountError", "amountUsdc <= 0"],
          ["NotWhitelistedError", "Whitelist is set and service isn't in it"],
          ["PerTxLimitExceededError", "amountUsdc > policy.per_tx_limit_usdc"],
          ["HourlyLimitExceededError", "Rolling 9 000-slot window would exceed policy.hourly_limit_usdc"],
          ["LifetimeLimitExceededError", "vault.total_spent + amountUsdc > policy.lifetime_limit_usdc"],
          ["OwnerNotConfiguredError", "Method needs an owner but none was configured"],
          ["AccountNotFoundError", "Target account doesn't exist on-chain (or 404 from REST)"],
          ["HttpError", "Non-2xx REST response from the backend"],
          ["PaymentParseError", "Malformed X-Payment-Required header in an x402 response"],
        ]}
      />
    </section>
  );
}

function ProgramIds() {
  return (
    <section>
      <H2 id="program-ids">Program IDs &amp; IDL</H2>
      <P>
        Program IDs are re-exported from the vendored IDLs. Use them for direct Anchor program
        construction, account derivation, or explorer links.
      </P>
      <Pre>{`import { PROGRAM_IDS } from "@agent-fuel/sdk";

PROGRAM_IDS.reputation;   // PublicKey
PROGRAM_IDS.creditVault;  // PublicKey`}</Pre>
      <P>
        Raw IDLs are exposed under sub-paths for downstream tooling (e.g. Anchor's{" "}
        <Code>Program</Code> constructor):
      </P>
      <Pre>{`import reputationIdl from "@agent-fuel/sdk/idl/reputation";
import creditVaultIdl from "@agent-fuel/sdk/idl/credit-vault";`}</Pre>
    </section>
  );
}
