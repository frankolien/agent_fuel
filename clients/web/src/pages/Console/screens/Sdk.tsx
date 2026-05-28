import { Link } from "react-router-dom";
import { CodeBlock } from "@/components/CodeBlock/CodeBlock";
import { Card } from "../components/Card";
import { Screen } from "./Screen";

const SDK_VERSION = "0.1.0";

const INSTALL = `pnpm add @agent-fuel/sdk @solana/web3.js`;

const QUICKSTART = `import { AgentFuel } from '@agent-fuel/sdk';
import { Keypair, Connection } from '@solana/web3.js';

const af = new AgentFuel({
  agent: keypair,                  // signer
  cluster: 'devnet',
  rpc:     'https://api.devnet.solana.com',
});

// Inside your x402 client interceptor:
const sig = await af.spend({ service: serviceKey, amountUsdcMicro: amount });

// Read reputation before serving a request:
const { score } = await af.getScore(agentKey);
if (score < 800) return charge(req);     // pre-pay path`;

type ApiRow = { name: string; hint: string };

const API: ApiRow[] = [
  { name: "af.spend(args)", hint: "Construct & send a policy-checked spend" },
  { name: "af.getScore(agent)", hint: "Read reputation from PDA" },
  { name: "af.getVaultBalance(ref)", hint: "Remaining USDC in vault" },
  { name: "af.getPolicy(ref)", hint: "Active spend constraints" },
  { name: "af.checkService(svc)", hint: "Whitelisted? cached for 60s" },
  { name: "af.onEvent(agent, cb)", hint: "WebSocket event stream" },
  { name: "paymentRequired(res)", hint: "Parse x402 402 response → SpendArgs" },
];

export function Sdk() {
  return (
    <Screen
      eyebrow={
        <>
          <span className="font-mono">@agent-fuel/sdk</span>
          <span className="text-muted">·</span>
          <span className="font-mono">v{SDK_VERSION}</span>
        </>
      }
      title="Agent SDK"
      subtitle="TypeScript wrapper around vault + reputation programs. Framework-agnostic."
      actions={
        <>
          <Link
            to="/docs"
            className="inline-flex h-8 items-center rounded-md border border-white/[0.16] bg-surface-2 px-3 font-mono text-[11.5px] text-fg-2 hover:bg-surface-3"
          >
            Docs ↗
          </Link>
          <a
            href="https://www.npmjs.com/package/@agent-fuel/sdk"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center rounded-md bg-mint px-3 font-semibold text-[11.5px] text-bg hover:bg-mint-soft"
          >
            Install
          </a>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Quickstart" meta="node ≥ 20">
          <div className="grid gap-3">
            <Labelled label="install">
              <CodeBlock lang="bash">{INSTALL}</CodeBlock>
            </Labelled>
            <Labelled label="spend.ts">
              <CodeBlock lang="ts">{QUICKSTART}</CodeBlock>
            </Labelled>
          </div>
        </Card>

        <Card title="API surface">
          <div className="grid gap-1">
            {API.map((row) => (
              <ApiItem key={row.name} {...row} />
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <Card title="Framework adapters">
          <p className="m-0 text-[13px] text-fg-2">
            The SDK is framework-agnostic. Drop it into any Node service that issues x402
            requests — Express, Fastify, Hono, raw <span className="font-mono text-mint-soft">fetch</span>.
            Use <span className="font-mono text-mint-soft">paymentRequired()</span> to parse a 402
            response and produce <span className="font-mono text-mint-soft">SpendArgs</span> for{" "}
            <span className="font-mono text-mint-soft">af.spend()</span>.
          </p>
        </Card>

        <Card title="Source & releases">
          <div className="grid gap-2 text-[12.5px]">
            <Row label="Package" value={<span className="font-mono">@agent-fuel/sdk</span>} />
            <Row label="Version" value={<span className="font-mono">v{SDK_VERSION}</span>} />
            <Row
              label="Repo"
              value={
                <a
                  href="https://github.com/frankolien/agent_fuel/tree/main/clients/sdk"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-mint-soft hover:text-mint"
                >
                  clients/sdk ↗
                </a>
              }
            />
            <Row label="License" value={<span className="font-mono">Apache-2.0</span>} />
          </div>
        </Card>
      </div>
    </Screen>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="font-mono text-[10.5px] tracking-[0.06em] text-muted uppercase">{label}</span>
      {children}
    </div>
  );
}

function ApiItem({ name, hint }: ApiRow) {
  return (
    <div className="flex items-baseline justify-between gap-4 rounded-md px-2 py-2 hover:bg-white/[0.03]">
      <span className="font-mono text-[12.5px] text-fg">{name}</span>
      <span className="text-right text-[11.5px] text-muted">{hint}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-mono text-[10.5px] tracking-[0.06em] text-muted uppercase">{label}</span>
      <span>{value}</span>
    </div>
  );
}
