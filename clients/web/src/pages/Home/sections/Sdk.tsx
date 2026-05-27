import { useState } from "react";
import { SDK_FNS } from "../content";

const CODE = `// Intercept the 402 from any x402 service
import { AgentFuel } from "@agent-fuel/sdk";

const af = new AgentFuel({
  agent:   keypair,
  cluster: "mainnet-beta",
  rpc:     process.env.HELIUS_RPC,
});

// On any HTTP 402:
const sig = await af.spend(service, amount);

// Before serving an inbound request:
const score = await af.getScore(agent);
if (score < 800) return charge(req);
`;

const TOK = {
  k: "text-mint",
  s: "text-[var(--color-syntax-string)]",
  c: "text-muted-2",
  fn: "text-[var(--color-syntax-fn)]",
  n: "text-fg",
};

export function Sdk() {
  return (
    <section id="sdk" className="pt-[120px]">
      <div className="mx-auto grid max-w-[var(--container-shell)] grid-cols-1 items-center gap-8 px-[var(--pad)] md:grid-cols-[1fr_1.05fr]">
        <div>
          <div className="mb-3.5 font-mono text-[11.5px] tracking-[0.18em] text-mint-soft uppercase">
            Agent SDK
          </div>
          <h3 className="m-0 mb-4 text-[36px] leading-[1.1] font-medium tracking-[-0.025em]">
            Six functions. <em className="text-mint not-italic">One import.</em>
          </h3>
          <p className="m-0 mb-6 text-base text-muted">
            Framework-agnostic TypeScript SDK. Wraps instruction construction, vault state reads,
            and the WebSocket event stream into async calls your agent already understands.
          </p>
          <ul className="m-0 mt-6 grid list-none gap-2.5 p-0">
            {SDK_FNS.map((fn) => (
              <li
                key={fn.name}
                className="grid grid-cols-[20px_1fr] items-center gap-3 text-[14.5px] text-fg-2 before:h-px before:w-3.5 before:self-center before:bg-mint before:opacity-80 before:content-['']"
              >
                <span className="font-mono">
                  <span className={TOK.fn}>{fn.name}</span>
                  {fn.sig}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <CodeCard />
      </div>
    </section>
  );
}

function CodeCard() {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(CODE);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable on insecure origins — silently ignore
    }
  };

  return (
    <div className="overflow-hidden rounded-[18px] border border-[var(--color-line)] bg-surface">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
        <div aria-hidden="true" className="inline-flex gap-1.5">
          <span className="h-[9px] w-[9px] rounded-full bg-white/15" />
          <span className="h-[9px] w-[9px] rounded-full bg-white/15" />
          <span className="h-[9px] w-[9px] rounded-full bg-white/15" />
        </div>
        <div className="font-mono text-xs text-muted">spend.ts</div>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-full border border-[var(--color-line)] px-2.5 py-1 font-mono text-[11.5px] text-muted hover:border-[var(--color-line-2)] hover:text-fg"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="m-0 overflow-x-auto px-5 py-5 font-mono text-[13px] leading-[1.65] whitespace-pre text-fg-2">
        <Highlighted />
      </pre>
    </div>
  );
}

function Highlighted() {
  return (
    <>
      <span className={TOK.c}>// Intercept the 402 from any x402 service</span>
      {"\n"}
      <span className={TOK.k}>import</span> {"{ AgentFuel } "}
      <span className={TOK.k}>from</span> <span className={TOK.s}>"@agent-fuel/sdk"</span>;{"\n\n"}
      <span className={TOK.k}>const</span> af = <span className={TOK.k}>new</span>{" "}
      <span className={TOK.fn}>AgentFuel</span>
      {"({\n  agent:   keypair,\n  cluster: "}
      <span className={TOK.s}>"mainnet-beta"</span>
      {",\n  rpc:     process.env.HELIUS_RPC,\n});\n\n"}
      <span className={TOK.c}>// On any HTTP 402:</span>
      {"\n"}
      <span className={TOK.k}>const</span> sig = <span className={TOK.k}>await</span> af.
      <span className={TOK.fn}>spend</span>(service, amount);
      {"\n\n"}
      <span className={TOK.c}>// Before serving an inbound request:</span>
      {"\n"}
      <span className={TOK.k}>const</span> score = <span className={TOK.k}>await</span> af.
      <span className={TOK.fn}>getScore</span>(agent);
      {"\n"}
      <span className={TOK.k}>if</span> (score &lt; <span className={TOK.n}>800</span>){" "}
      <span className={TOK.k}>return</span> <span className={TOK.fn}>charge</span>(req);
      {"\n"}
    </>
  );
}
