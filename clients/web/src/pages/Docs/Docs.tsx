import { useEffect, useMemo, useRef, useState } from "react";
import { Nav } from "@/components/Nav/Nav";
import { Footer } from "@/components/Footer/Footer";
import { CodeBlock, type Lang } from "@/components/CodeBlock/CodeBlock";
import { cn } from "@/lib/cn";

type Sub = { id: string; title: string };
type Section = { id: string; title: string; subs: Sub[] };
type DocsLang = "ts" | "py";

const TOC_TS: Section[] = [
  { id: "install", title: "Install", subs: [] },
  {
    id: "cli",
    title: "CLI",
    subs: [
      { id: "cli-reads", title: "Read commands" },
      { id: "cli-actions", title: "Action commands" },
      { id: "cli-dev", title: "Dev helpers" },
    ],
  },
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
    title: "The SDK",
    subs: [
      { id: "fn-spend", title: "spend()" },
      { id: "fn-pay", title: "pay()" },
      { id: "fn-request-spend", title: "requestSpend()" },
      { id: "fn-register-service", title: "registerService()" },
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

const TOC_PY: Section[] = [
  { id: "py-install", title: "Install", subs: [] },
  {
    id: "py-quick-start",
    title: "Quick start",
    subs: [
      { id: "py-constructor", title: "Constructor" },
      { id: "py-owner-option", title: "Owner option" },
    ],
  },
  {
    id: "py-sdk",
    title: "The SDK",
    subs: [
      { id: "py-fn-spend", title: "spend()" },
      { id: "py-fn-pay", title: "pay()" },
      { id: "py-fn-request-spend", title: "request_spend()" },
      { id: "py-fn-register-service", title: "register_service()" },
      { id: "py-fn-get-score", title: "get_score()" },
      { id: "py-fn-get-vault-balance", title: "get_vault_balance()" },
      { id: "py-fn-get-policy", title: "get_policy()" },
      { id: "py-fn-check-service", title: "check_service()" },
      { id: "py-fn-on-event", title: "on_event()" },
    ],
  },
  { id: "py-x402", title: "Paying with x402", subs: [] },
  { id: "py-errors", title: "Error reference", subs: [] },
  { id: "py-program-ids", title: "Program IDs & IDL", subs: [] },
];

export function Docs() {
  const [lang, setLang] = useState<DocsLang>("ts");
  const toc = lang === "ts" ? TOC_TS : TOC_PY;
  const allIds = useMemo(() => toc.flatMap((s) => [s.id, ...s.subs.map((sub) => sub.id)]), [toc]);
  const [active, setActive] = useState<string>(allIds[0] ?? "");
  const visibleRef = useRef(new Set<string>());

  useEffect(() => {
    // Reset active section when toggling language so the sidebar highlight
    // doesn't point at a stale id that no longer exists in the rendered tree.
    setActive(allIds[0] ?? "");
    visibleRef.current.clear();
  }, [allIds]);

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
          <Sidebar toc={toc} active={active} />
          <article className="min-w-0 [&_h2]:scroll-mt-24 [&_h3]:scroll-mt-24 [&_h4]:scroll-mt-24">
            <header className="mb-12">
              <div className="mb-3 font-mono text-[11.5px] tracking-[0.18em] text-mint-soft uppercase">
                Agent Fuel SDK
              </div>
              <h1 className="m-0 text-[44px] leading-[1.05] font-medium tracking-[-0.025em]">
                Docs
              </h1>
              <p className="mt-4 max-w-[640px] text-[15.5px] leading-relaxed text-muted">
                Two first-class clients for Agent Fuel — credit vault + reputation primitives for AI
                agents on Solana. Compose vault payments, reputation accrual, service registration,
                and the over-limit approval flow with one import. On-chain payments via x402.
              </p>
              <LangPicker lang={lang} onChange={setLang} />
            </header>

            {lang === "ts" ? <TsDocs /> : <PyDocs />}
          </article>
        </div>
        <Footer />
      </main>
    </>
  );
}

function TsDocs() {
  return (
    <>
      <Install />
      <CliBin />
      <QuickStart />
      <SdkFunctions />
      <X402 />
      <Errors />
      <ProgramIds />
    </>
  );
}

function PyDocs() {
  return (
    <>
      <PyInstall />
      <PyQuickStart />
      <PySdkFunctions />
      <PyX402 />
      <PyErrors />
      <PyProgramIds />
    </>
  );
}

function LangPicker({ lang, onChange }: { lang: DocsLang; onChange: (lang: DocsLang) => void }) {
  return (
    <div className="mt-6 inline-flex rounded-full border border-[var(--color-line)] bg-surface p-1">
      {(["ts", "py"] as const).map((value) => {
        const active = lang === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            className={cn(
              "rounded-full px-4 py-1.5 font-mono text-[12.5px] tracking-wide transition-colors",
              active
                ? "bg-mint text-bg"
                : "text-muted hover:text-fg",
            )}
            aria-pressed={active}
          >
            {value === "ts" ? "TypeScript" : "Python"}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Sidebar ----------

function Sidebar({ toc, active }: { toc: Section[]; active: string }) {
  return (
    <aside className="hidden md:block">
      <nav className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2">
        <div className="mb-3 font-mono text-[11px] tracking-[0.18em] text-muted-2 uppercase">
          On this page
        </div>
        <ul className="m-0 list-none p-0 text-[13.5px]">
          {toc.map((s) => (
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

function CliBin() {
  return (
    <section>
      <H2 id="cli">CLI</H2>
      <P>
        Installing the package also installs an <Code>agent-fuel</Code> binary. Read commands need
        no setup at all — anyone can inspect a vault from the terminal in one line:
      </P>
      <Pre lang="bash">{`npx @agent-fuel/sdk vault <owner-pubkey> <agent-pubkey>`}</Pre>
      <P>
        Three command surfaces: read commands (no key), action commands (require a keypair file),
        and dev helpers. All commands accept <Code>--json</Code> for machine-readable output you
        can pipe into <Code>jq</Code>.
      </P>

      <H3 id="cli-reads">Read commands</H3>
      <P>
        Public on-chain / REST reads. No keypair needed, no install. Each command takes pubkeys
        positionally and prints a human-readable summary by default.
      </P>
      <Pre lang="bash">{`agent-fuel score   <agent-pubkey>
agent-fuel vault   <owner-pubkey> <agent-pubkey>
agent-fuel policy  <owner-pubkey> <agent-pubkey>
agent-fuel service <service-authority-pubkey>`}</Pre>
      <P>
        Not-found errors name the resource and quote the inputs that produced the lookup, so you
        never see a raw PDA without context. Example:
      </P>
      <Pre lang="bash">{`$ agent-fuel vault Cowi… 5ro8…
agent-fuel: no vault found at <PDA> for owner=Cowi… agent=5ro8… — has init_vault been called for this pair?`}</Pre>

      <H3 id="cli-actions">Action commands</H3>
      <P>
        Action commands take one or more <Code>solana-keygen</Code>-style JSON keypair files (the
        64-byte secret-key array format <Code>solana-keygen new --outfile</Code> writes). Three
        actions mirror the SDK methods:
      </P>
      <Pre lang="bash">{`# Atomic spend + record_payment + compute_score in one tx.
agent-fuel pay \\
  --keypair         ~/.config/solana/agent.json \\
  --service-keypair ~/.config/solana/svc-pyth.json \\
  --owner           <owner-pubkey> \\
  --amount          0.005

# Over-limit spend request — owner approves from the mobile app.
agent-fuel request-spend \\
  --keypair ~/.config/solana/agent.json \\
  --owner   <owner-pubkey> \\
  --service <service-pubkey> \\
  --amount  30

# Register a new service on chain (two-signer).
agent-fuel register-service \\
  --sponsor         ~/.config/solana/id.json \\
  --service-keypair ~/.config/solana/svc-pyth.json \\
  --name            "Pyth BTC Feed" \\
  --category        DataFeed`}</Pre>
      <Callout kind="note">
        <Code>pay</Code> bundles <Code>compute_score</Code> in the same atomic tx, so the agent's
        on-chain reputation score moves with every payment. No extra signer, no extra fee, no
        race window where the spend lands but the score-update tx is lost.
      </Callout>

      <H3 id="cli-dev">Dev helpers + global flags</H3>
      <P>
        <Code>keygen</Code> generates a fresh keypair. The secret-key JSON goes to <Code>stderr</Code> and
        the pubkey to <Code>stdout</Code>, so you choose what to redirect — or pass <Code>--out path</Code> to
        write the keypair to a file directly.
      </P>
      <Pre lang="bash">{`agent-fuel keygen --out ~/.config/solana/svc-new.json
# wrote keypair to /Users/you/.config/solana/svc-new.json
#   pubkey 5ro8Tb16gD8P7D975ZwMfUvABZvkqyLCF6wySvpTntZj`}</Pre>
      <P>Every command accepts the same global flags:</P>
      <Table
        rows={[
          ["--cluster <name>", "mainnet-beta | devnet | testnet | localnet (default: devnet)"],
          ["--rpc <url>", "override the default RPC URL for the chosen cluster"],
          [
            "--api-base <url>",
            "Agent Fuel backend base URL for read commands (default: https://api.agentfuel.online)",
          ],
          ["--json", "emit machine-readable JSON instead of human text"],
          ["--version / --help", "self-explanatory; --help works per-command too"],
        ]}
      />
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
      <H2 id="sdk">The SDK</H2>
      <P>
        Nine methods plus a fetch wrapper for x402. Every method throws{" "}
        <Code>AccountNotFoundError</Code> when the target doesn't exist on-chain (or the backend
        returns 404), and <Code>HttpError</Code> for non-2xx REST responses.
      </P>

      <H3 id="fn-spend">spend()</H3>
      <P>
        Pay a service from the agent's vault — vault burn only, no reputation accrual. The SDK
        fetches the current vault + policy and applies the same six-check ladder the on-chain
        program enforces — any failure surfaces as a typed error so callers can branch without
        parsing strings. The service's USDC associated token account is created on-demand
        (~0.002 SOL rent, paid by the agent).
      </P>
      <Pre>{`const { signature } = await fuel.spend({
  service: serviceAuthorityPubkey,
  amountUsdc: 250_000, // micro-USDC (0.25 USDC)
});`}</Pre>
      <Callout kind="note">
        For typical paying bots, prefer <Code>pay()</Code> below — it keeps the vault burn and the
        reputation accrual in one atomic transaction so a service can't end up paid without the
        agent's score moving.
      </Callout>

      <H3 id="fn-pay">pay()</H3>
      <P>
        Atomic <Code>spend</Code> + <Code>record_payment</Code> in one transaction. The agent
        signs the spend half; the service keypair co-signs the reputation half. Both land or
        neither does. Use this when you want the vault burn and the reputation accrual
        all-or-nothing — the standard pattern for a paying agent.
      </P>
      <Pre>{`import { createHash } from "node:crypto";

const receiptHash = createHash("sha256")
  .update(\`\${agent.publicKey}|\${service.publicKey}|\${tick}|\${price}\`)
  .digest();

const { signature } = await fuel.pay({
  service: serviceKeypair,            // Keypair, not pubkey — co-signs the tx
  amountUsdc: 10_000,                  // micro-USDC (0.01 USDC)
  receiptHash,                          // 32 bytes; must be unique per call
});`}</Pre>
      <Callout kind="warn">
        Receipts are single-use on chain — replaying the same hash hits{" "}
        <Code>ReceiptAlreadyRecordedError</Code> and the whole tx reverts. Include a monotonic
        counter or timestamp in the hash so retries don't collide.
      </Callout>

      <H3 id="fn-request-spend">requestSpend()</H3>
      <P>
        Agent-initiated half of the over-limit approval flow. When a trade would exceed your
        vault's <Code>per_tx_limit_usdc</Code>, call this instead of <Code>spend()</Code> — it
        enqueues a <Code>PendingSpend</Code> account the owner can later approve from the mobile
        app or reject. The bot polls the returned PDA to learn the verdict.
      </P>
      <Pre>{`const { signature, pendingSpend, nonce } = await fuel.requestSpend({
  service: serviceAuthorityPubkey,
  amountUsdc: 30_000_000, // 30 USDC, above policy
});

// Poll pendingSpend until it closes — account-gone means resolved.
// Approved → vault.total_spent advanced (CPI'd transfer).
// Rejected → vault unchanged (account just closed).`}</Pre>

      <H3 id="fn-register-service">registerService()</H3>
      <P>
        Register a service on chain so agents can pay against it and accrue reputation. Two
        signers: the sponsor (pays rent, submits the tx — typically the owner wallet) and the
        service keypair (long-lived signing identity that co-signs every future{" "}
        <Code>record_payment</Code>). Idempotent only at the keypair level — re-registering the
        same key fails because the registry PDA already exists.
      </P>
      <Pre>{`const { signature } = await fuel.registerService({
  sponsor: sponsorKeypair,            // pays rent + tx fee
  service: serviceKeypair,            // long-lived service identity
  name: "Pyth BTC/USD",                // <= 32 bytes UTF-8
  category: "DataFeed",                // DataFeed | Compute | Swap | Rpc | Other
  serviceUri: "https://hermes.pyth.network/...", // optional, <= 128 bytes
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
          ["ReceiptAlreadyRecordedError", "Receipt hash was already used by recordPayment / pay — replay defence"],
          ["RecordPaymentError", "Generic record_payment failure (e.g. on-chain counter overflow)"],
          ["ServiceInactiveError", "Service has been deactivated by its authority"],
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

// ---------- Python sections ----------

function PyInstall() {
  return (
    <section>
      <H2 id="py-install">Install</H2>
      <P>
        The Python SDK ships as <Code>agent-fuel-sdk</Code> on PyPI. Requires Python ≥ 3.10. The
        Rust-backed <Code>solders</Code> package handles every Solana primitive (keypairs,
        transactions, RPC), <Code>httpx</Code> is the async HTTP client, and{" "}
        <Code>websockets</Code> powers the live event stream — all installed automatically.
      </P>
      <Pre lang="bash">{`pip install agent-fuel-sdk`}</Pre>
      <P>
        Every method is <Code>async</Code>. The client uses a context manager so the underlying
        HTTP pool releases cleanly on exit.
      </P>
    </section>
  );
}

function PyQuickStart() {
  return (
    <section>
      <H2 id="py-quick-start">Quick start</H2>

      <H3 id="py-constructor">Constructor</H3>
      <P>
        Construct an <Code>AgentFuel</Code> with the agent keypair, the cluster, and (optionally)
        the wallet that funded the vault. The default <Code>api_base</Code> points at the hosted
        backend; override it to run against a local stack.
      </P>
      <Pre lang="python">{`import asyncio
from solders.keypair import Keypair
from agent_fuel import AgentFuel


async def main() -> None:
    agent = Keypair()  # load yours from a keystore

    async with AgentFuel(
        agent=agent,
        cluster="devnet",
        owner="...the wallet that funded your vault...",
    ) as fuel:
        score = await fuel.get_score()
        print(score.score, score.total_transactions)


asyncio.run(main())`}</Pre>

      <H3 id="py-owner-option">Owner option</H3>
      <P>
        <Code>owner</Code> is optional. When you pass it on the constructor, methods like{" "}
        <Code>get_vault_balance</Code>, <Code>get_policy</Code>, <Code>pay</Code>, and{" "}
        <Code>spend</Code> default to your own vault — call them with no <Code>owner=</Code>{" "}
        argument. Pass <Code>owner=</Code> per call only when inspecting someone else's vault.
      </P>
      <Callout kind="note">
        Calling a method that needs the owner without configuring one anywhere raises{" "}
        <Code>OwnerNotConfiguredError</Code>.
      </Callout>
    </section>
  );
}

function PySdkFunctions() {
  return (
    <section>
      <H2 id="py-sdk">The SDK</H2>
      <P>
        Surface mirrors the TypeScript SDK exactly — same names (snake_case), same field names,
        same error hierarchy. Every method throws <Code>AccountNotFoundError</Code> when the
        target doesn't exist on-chain (or the backend returns 404), and <Code>HttpError</Code>{" "}
        for non-2xx REST responses.
      </P>

      <H3 id="py-fn-spend">spend()</H3>
      <P>
        Burn USDC from the vault to an arbitrary recipient — no reputation event, no receipt
        hash. Use this for x402 payments to servers that aren't registered as Agent Fuel
        services. The same six-check guardrail (frozen / zero / whitelist / per-tx / hourly /
        lifetime) runs pre-flight; the recipient's USDC associated token account is created
        on-demand.
      </P>
      <Pre lang="python">{`from agent_fuel import AgentFuel

result = await fuel.spend(
    recipient="...service pubkey or any wallet...",
    amount_usdc=250_000,  # micro-USDC (0.25)
)
print(result.signature)`}</Pre>
      <Callout kind="note">
        For payments to registered services, prefer <Code>pay()</Code> below — it keeps the
        vault burn, the reputation accrual, and the score recompute in one atomic transaction.
      </Callout>

      <H3 id="py-fn-pay">pay()</H3>
      <P>
        Atomic <Code>spend</Code> + <Code>record_payment</Code> + <Code>compute_score</Code> in
        one transaction. The agent signs the spend half; the service keypair co-signs the
        reputation half; the bundled <Code>compute_score</Code> advances the on-chain score in
        the same tx so the backend's <Code>agents.score</Code> mirror never lags. All-or-nothing.
      </P>
      <Pre lang="python">{`from hashlib import sha256
from solders.keypair import Keypair

agent = Keypair.from_bytes(open("agent.bin", "rb").read())
service = Keypair.from_bytes(open("svc-pyth.bin", "rb").read())

result = await fuel.pay(
    service=service,                                # Keypair, co-signs the tx
    amount_usdc=10_000,                              # micro-USDC (0.01)
    receipt_hash=sha256(b"tick-42").digest(),        # 32 bytes, unique per call
)
print(result.signature)`}</Pre>
      <Callout kind="warn">
        Receipts are single-use on chain — replaying the same hash raises{" "}
        <Code>ReceiptAlreadyRecordedError</Code> and the whole tx reverts. Include a monotonic
        counter or timestamp in the hash so retries don't collide.
      </Callout>

      <H3 id="py-fn-request-spend">request_spend()</H3>
      <P>
        Agent-initiated half of the over-limit approval flow. When a trade would exceed the
        vault's <Code>per_tx_limit_usdc</Code>, enqueue a <Code>PendingSpend</Code> the owner can
        approve from the mobile app. The bot polls the returned PDA to learn the verdict.
      </P>
      <Pre lang="python">{`pending = await fuel.request_spend(
    service=service.pubkey(),
    amount_usdc=30_000_000,  # 30 USDC, above policy
)
print(pending.signature, pending.pending_spend, pending.nonce)`}</Pre>

      <H3 id="py-fn-register-service">register_service()</H3>
      <P>
        Register a service on chain. Two signers: the <Code>sponsor</Code> (pays rent + tx fee,
        typically the owner wallet) and the <Code>service</Code> keypair (long-lived identity
        that co-signs every future <Code>record_payment</Code>).
      </P>
      <Pre lang="python">{`reg = await fuel.register_service(
    sponsor=sponsor_keypair,
    service=service_keypair,
    name="Pyth BTC/USD",             # <= 32 bytes UTF-8
    category="DataFeed",              # DataFeed | Compute | Swap | Rpc | Other
    service_uri="https://hermes.pyth.network/...",
)
print(reg.signature)`}</Pre>

      <H3 id="py-fn-get-score">get_score()</H3>
      <P>
        Public reputation snapshot via REST — no auth needed. <Code>score</Code> is{" "}
        <Code>None</Code> for unscored agents.
      </P>
      <Pre lang="python">{`mine = await fuel.get_score()
other = await fuel.get_score("...other agent pubkey...")`}</Pre>

      <H3 id="py-fn-get-vault-balance">get_vault_balance()</H3>
      <P>
        On-chain credit-vault state with a derived <Code>balance</Code> field. Defaults to the
        agent's own vault when <Code>owner</Code> was passed to the constructor.
      </P>
      <Pre lang="python">{`from agent_fuel import VaultRef

vault = await fuel.get_vault_balance()
print(vault.balance, vault.frozen)

other = await fuel.get_vault_balance(
    VaultRef(owner="...", agent="..."),
)`}</Pre>

      <H3 id="py-fn-get-policy">get_policy()</H3>
      <P>
        On-chain spend policy — per-transaction, hourly, and lifetime caps, the optional
        whitelist, and the freeze flag. A limit of <Code>0</Code> means{" "}
        <em>no enforcement</em>, not "zero allowed".
      </P>
      <Pre lang="python">{`policy = await fuel.get_policy()
print(policy.per_tx_limit_usdc, policy.whitelist)`}</Pre>

      <H3 id="py-fn-check-service">check_service()</H3>
      <P>Service-registry lookup by the registering wallet's pubkey.</P>
      <Pre lang="python">{`service = await fuel.check_service("...service authority pubkey...")
print(service.name, service.category, service.active)`}</Pre>

      <H3 id="py-fn-on-event">on_event()</H3>
      <P>
        Self-healing WebSocket subscription to the backend's <Code>/ws/agents/&lt;pubkey&gt;</Code>{" "}
        channel. The callback may be sync or async; <Code>on_status</Code> fires on every{" "}
        <Code>connecting → open → reconnecting → closed</Code> transition. Exponential backoff
        (1 s → 2 s → … → 30 s cap); the subscription survives transient drops until{" "}
        <Code>await sub.close()</Code>.
      </P>
      <Pre lang="python">{`from agent_fuel import LiveEventFrame, LiveStatus

def on_frame(frame: LiveEventFrame) -> None:
    print(frame.event_name, frame.signature, frame.payload)

def on_status(status: LiveStatus) -> None:
    print("ws:", status)

sub = fuel.on_event(on_frame, on_status=on_status)
try:
    await asyncio.sleep(60)
finally:
    await sub.close()`}</Pre>
      <Callout kind="note">
        <Code>fuel.on_service_event(service, ...)</Code> and{" "}
        <Code>fuel.on_vault_event(vault, ...)</Code> cover the other two entity channels — useful
        for service-side recorders that don't own the agent's keypair.
      </Callout>
    </section>
  );
}

function PyX402() {
  return (
    <section>
      <H2 id="py-x402">Paying with x402</H2>
      <P>
        <Code>fuel.payment_required()</Code> returns a fetch-shaped object that transparently
        handles HTTP 402. Pass <Code>http_client=</Code> to route through your own{" "}
        <Code>httpx.AsyncClient</Code>; defaults to the shared one the SDK already holds.
      </P>
      <Pre lang="python">{`fetcher = fuel.payment_required(
    on_payment_required=lambda req: print("402:", req.recipient, req.amount_usdc),
    on_paid=lambda sig, req: print("paid:", sig),
)

# get / post / put / patch / delete / request all work
res = await fetcher.get("https://paid.example/feed")
print(res.status_code, res.text)`}</Pre>
      <P>The flow:</P>
      <ol className="my-4 list-decimal space-y-1.5 pl-6 text-[14.5px] text-fg-2">
        <li>The wrapped request runs.</li>
        <li>
          If the response is <Code>402</Code>, the SDK parses the{" "}
          <Code>X-Payment-Required</Code> header (JSON; or the response body as a fallback) for{" "}
          <Code>recipient</Code> / <Code>amount_usdc</Code>. The aliases{" "}
          <Code>amountUsdc</Code>, <Code>payTo</Code>, and <Code>maxAmountRequired</Code> are
          accepted as well, so x402-spec servers work without configuration.
        </li>
        <li>
          <Code>fuel.spend()</Code> is called with those values — all six policy guardrails
          apply, any failure throws the matching <Code>SpendPolicyError</Code> and the request
          is <em>not</em> retried.
        </li>
        <li>
          The original request is retried once with <Code>X-Payment: &lt;signature&gt;</Code>.
        </li>
      </ol>
      <Callout kind="warn">
        A second <Code>402</Code> propagates to the caller as the response object (no infinite
        loop, no exception). Malformed payment payloads raise <Code>PaymentParseError</Code>.
      </Callout>
    </section>
  );
}

function PyErrors() {
  return (
    <section>
      <H2 id="py-errors">Error reference</H2>
      <P>
        Every policy check has a dedicated subclass of <Code>SpendPolicyError</Code> — catch the
        base type for one branch, or catch the specific subtype for tailored handling. The
        Anchor-level rejections from the on-chain program map to the same types as the
        pre-flight guardrail, so the caller doesn't need to know whether the rejection came
        from local code or from the chain.
      </P>
      <Table
        rows={[
          ["VaultFrozenError", "vault.frozen is True"],
          ["ZeroAmountError", "amount_usdc <= 0"],
          ["NotWhitelistedError", "whitelist is set and service isn't in it"],
          ["PerTxLimitExceededError", "amount_usdc > policy.per_tx_limit_usdc"],
          ["HourlyLimitExceededError", "rolling 9 000-slot window would exceed policy.hourly_limit_usdc"],
          ["LifetimeLimitExceededError", "vault.total_spent + amount_usdc > policy.lifetime_limit_usdc"],
          ["OwnerNotConfiguredError", "method needs an owner but none was configured"],
          ["AccountNotFoundError", "target account doesn't exist on chain (or 404 from REST)"],
          ["ReceiptAlreadyRecordedError", "receipt hash was already used by pay() — replay defence"],
          ["RecordPaymentError", "generic record_payment failure (e.g. on-chain counter overflow)"],
          ["ServiceInactiveError", "service has been deactivated by its authority"],
          ["HttpError", "non-2xx REST response from the backend"],
          ["PaymentParseError", "malformed X-Payment-Required header in an x402 response"],
        ]}
      />
    </section>
  );
}

function PyProgramIds() {
  return (
    <section>
      <H2 id="py-program-ids">Program IDs &amp; IDL</H2>
      <P>
        Program IDs are re-exported as <Code>solders.pubkey.Pubkey</Code> values from the
        vendored IDLs. Use them for direct instruction-builder composition or explorer links.
      </P>
      <Pre lang="python">{`from agent_fuel import CREDIT_VAULT_PROGRAM_ID, REPUTATION_PROGRAM_ID

print(CREDIT_VAULT_PROGRAM_ID)
print(REPUTATION_PROGRAM_ID)`}</Pre>
      <P>
        The IDL JSON files are bundled inside the wheel for tooling that needs them
        (e.g. Codama generators or your own decoder):
      </P>
      <Pre lang="python">{`from importlib.resources import files
import json

reputation_idl = json.loads(files("agent_fuel.idl").joinpath("reputation.json").read_text())
credit_vault_idl = json.loads(files("agent_fuel.idl").joinpath("credit_vault.json").read_text())`}</Pre>
    </section>
  );
}
