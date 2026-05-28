# Agent Fuel — Web

React + TypeScript web app for Agent Fuel. The home route implements the design
shipped from Claude Design (`Agent Fuel.html`); the console route is a
placeholder until the operator UI lands.

## Stack

- **Vite 5** + **React 18** + **TypeScript** (strict)
- **React Router v6** for routing
- **Tailwind CSS v4** via `@tailwindcss/vite` — no PostCSS config, no `tailwind.config.js`. Design tokens live in `src/styles/main.css` under `@theme {}` so every color and font becomes a utility (e.g. `bg-mint`, `text-muted`).
- **TanStack Query v5** for server state, caching, and (later) WS-merged updates
- **`@solana/wallet-adapter-react` + Wallet Standard** for wallet connection (Phantom / Backpack / Solflare auto-discovered)
- **Geist** / **Geist Mono** from Google Fonts

A handful of composite utilities (multi-stop radials, layered shadows, halos)
live in the `@layer utilities` block of `main.css`. Everything else is plain
Tailwind in the JSX.

## Layout

```
src/
├── app/                  RouterProvider, providers, auth context, error boundary
│   ├── App.tsx           ErrorBoundary > QueryClient > Wallet > Auth > Router
│   ├── router.tsx        Route table, RequireAuth wraps /console
│   ├── auth.tsx          useAuth() + <RequireAuth> + JWT/wallet pubkey sync
│   ├── useSiwsSignIn.ts  nonce → wallet.signMessage → verify → store JWT
│   ├── WalletProviders.tsx  ConnectionProvider > WalletProvider > WalletModalProvider
│   ├── queryClient.ts    TanStack defaults: 30s stale, no 4xx retry, no focus refetch
│   └── ErrorBoundary.tsx Recoverable error panel
├── components/           Reusable UI: Brand, Pill, Nav, Footer, Icons, SectionHeading
├── pages/
│   ├── Home/             Composes the design's sections from content.ts
│   │   ├── Home.tsx
│   │   ├── content.ts    Typed content for cards, stats, sdk fns, tutorials
│   │   └── sections/     Hero, CategoryStrip, Protocol, HowItWorks, Stats, Sdk, Tutorials, Cta
│   ├── SignIn/           SIWS sign-in page (/signin)
│   ├── PublicReputation/ Unauthenticated /reputation/:agent deep-link target
│   └── Console/          Operator console — sidebar + topbar shell, nested screen routes
│       ├── ConsoleLayout.tsx
│       ├── Sidebar.tsx
│       ├── Topbar.tsx
│       ├── nav.ts        Nav items + route paths
│       ├── icons.tsx     Console-only SVGs
│       ├── components/   Card, Kpi, Sparkline, ActivityRow, AddressPill, ScoreBadge, Gauge, PolicyChip, LiveBadge, Ticker, Skeleton
│       ├── useFleetTicker.ts  Fan-out subscription for the topbar marquee
│       └── screens/      Fleet, Agents (+ AgentDetail), Vaults (+ VaultDetail), Activity, Services, Analytics, Sdk
├── styles/
│   └── main.css          @import "tailwindcss" + @theme tokens + custom utilities
├── types/
│   └── api.ts            Backend response shapes (Agent, Vault, Event, …)
└── lib/
    ├── cn.ts             Classnames helper
    ├── config.ts         VITE_API_BASE, VITE_SOLANA_RPC, … — read-once, frozen
    ├── http.ts           Typed fetch wrapper (Authorization header, HttpError)
    ├── auth-store.ts     JWT in localStorage with subscribe()
    ├── format.ts         USDC / number / pubkey / slot→ago formatters
    └── api/
        ├── client.ts        api.listAgents(), api.getVault(), … — every call goes through here
        ├── hooks.ts         useAgentsQuery(), useAgentQuery(pk), useVaultsQuery(), …
        ├── keys.ts          queryKeys.agent(pk), queryKeys.vaultActivity(pk), …
        ├── live.ts          subscribeAgent(pk) — WS with reconnect
        └── useLiveAgent.ts  Per-agent live merge into TanStack cache
```

Section data lives in `content.ts` so copy edits don't require touching JSX.

## Run

```bash
cd clients/web
cp .env.example .env       # first time only
npm install
npm run dev
# → http://localhost:5173

npm run typecheck
npm run build
npm run preview
```

The console talks to a real backend (default `http://localhost:8080`, or whatever
`VITE_API_BASE` points to). Run `cargo run` in `../../backend` first, or point
`VITE_API_BASE` at the deployed backend if you only want to work on the UI.

## Design source

The handoff bundle (HTML/CSS prototype + chat transcripts) is preserved under
the design tool's archive. The React port is the source of truth from here on —
edit components, not the prototype.
