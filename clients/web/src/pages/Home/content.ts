import {
  CameraIcon,
  DocIcon,
  PoliciesIcon,
  PulseIcon,
  SdkIcon,
  ShieldCheckIcon,
  VaultIcon,
  X402Icon,
} from "@/components/Icons/Icons";
import type { ComponentType, SVGProps } from "react";

export type Category = {
  id: string;
  label: string;
  href: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

export const CATEGORIES: ReadonlyArray<Category> = [
  { id: "reputation", label: "Reputation", href: "#reputation", Icon: ShieldCheckIcon },
  { id: "vaults", label: "Credit Vaults", href: "#vaults", Icon: VaultIcon },
  { id: "policies", label: "Policies", href: "#policies", Icon: PoliciesIcon },
  { id: "sdk", label: "Agent SDK", href: "#sdk", Icon: SdkIcon },
  { id: "x402", label: "x402", href: "#how", Icon: X402Icon },
];

export type Feature = {
  num: string;
  id: string;
  titleHtml: { lead: string; em: string; tail: string };
  body: string;
};

export const FEATURES: ReadonlyArray<Feature> = [
  {
    num: "01 — Reputation",
    id: "reputation",
    titleHtml: { lead: "An ", em: "on-chain credit bureau", tail: " for AI agents." },
    body: "A 0–1000 score from five normalized factors — volume, consistency, diversity, longevity, and dispute rate. Services check it before serving a request.",
  },
  {
    num: "02 — Credit Vaults",
    id: "vaults",
    titleHtml: { lead: "Budget-bound ", em: "spending accounts", tail: "." },
    body: "Fund a vault with USDC. The PDA owns the token account — a compromised agent key can't drain it. Freeze in one click for incident response.",
  },
  {
    num: "03 — Policies",
    id: "policies",
    titleHtml: { lead: "Per-tx, per-hour, ", em: "per-service", tail: " caps." },
    body: "A 16-slot whitelist, rolling hourly limits, lifetime budget ceilings, and an emergency freeze. Enforced on-chain before every transfer.",
  },
];

export type Step = {
  num: string;
  title: { lead?: string; mono?: string; tail?: string };
  body: string;
};

export const STEPS: ReadonlyArray<Step> = [
  {
    num: "STEP 01",
    title: { lead: "Service replies ", mono: "HTTP 402" },
    body: "The provider asks for USDC on Solana with a PAYMENT-REQUIRED header.",
  },
  {
    num: "STEP 02",
    title: { lead: "SDK calls ", mono: "spend()" },
    body: "The vault program validates per-tx, per-hour, whitelist, and frozen-state — all on chain.",
  },
  {
    num: "STEP 03",
    title: { lead: "CPI transfers USDC" },
    body: "If valid, a PDA-signed transfer pays the service. Counters update. A SpendEvent is emitted.",
  },
  {
    num: "STEP 04",
    title: { lead: "Reputation updates" },
    body: "Helius webhook → Axum indexer → score engine. Reputation reflects the payment within seconds.",
  },
];

export type Stat = {
  label: string;
  value: string;
  sub: string;
};

export const STATS: ReadonlyArray<Stat> = [
  { label: "x402 volume", value: "$600M+", sub: "Annualized, Q1 2026" },
  { label: "Solana share", value: "65%", sub: "Of agentic payment volume" },
  { label: "Frameworks", value: "5+", sub: "Agent Kit · ElizaOS · GOAT" },
  { label: "Settlement", value: "~400ms", sub: "From spend to confirmation" },
];

export type SdkFn = { name: string; sig: string };

export const SDK_FNS: ReadonlyArray<SdkFn> = [
  { name: "af.spend", sig: "(svc, amt)" },
  { name: "af.getScore", sig: "(agent)" },
  { name: "af.getVaultBalance", sig: "(agent)" },
  { name: "af.getPolicy", sig: "(agent)" },
  { name: "af.checkService", sig: "(svc)" },
  { name: "af.onEvent", sig: "(agent, cb)" },
];

export type Tutorial = {
  title: string;
  body: string;
  meta: string;
  href: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

export const TUTORIALS: ReadonlyArray<Tutorial> = [
  {
    title: "Quickstart · Initialize an agent",
    body: "From solana airdrop to your first signed spend in nine commands.",
    meta: "5 min · cli",
    href: "#",
    Icon: DocIcon,
  },
  {
    title: "Fund and freeze a vault",
    body: "Deposit USDC, attach a spend policy, and rehearse emergency freeze from your phone.",
    meta: "8 min · sdk",
    href: "#",
    Icon: CameraIcon,
  },
  {
    title: "Wire reputation into a service",
    body: "Gate access and set tiered pricing by checking the agent's on-chain score before responding.",
    meta: "12 min · provider",
    href: "#",
    Icon: PulseIcon,
  },
];
