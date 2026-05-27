# Agent Fuel — Web

React + TypeScript web app for Agent Fuel. The home route implements the design
shipped from Claude Design (`Agent Fuel.html`); the console route is a
placeholder until the operator UI lands.

## Stack

- **Vite 5** + **React 18** + **TypeScript** (strict)
- **React Router v6** for routing
- **Tailwind CSS v4** via `@tailwindcss/vite` — no PostCSS config, no `tailwind.config.js`. Design tokens live in `src/styles/main.css` under `@theme {}` so every color and font becomes a utility (e.g. `bg-mint`, `text-muted`).
- **TanStack Query v5** for server state, caching, and (later) WS-merged updates
- **Geist** / **Geist Mono** from Google Fonts

A handful of composite utilities (multi-stop radials, layered shadows, halos)
live in the `@layer utilities` block of `main.css`. Everything else is plain
Tailwind in the JSX.

## Layout

```
src/
├── app/                  RouterProvider, route table
├── components/           Reusable UI: Brand, Pill, Nav, Footer, Icons, SectionHeading
├── pages/
│   ├── Home/             Composes the design's sections from content.ts
│   │   ├── Home.tsx
│   │   ├── content.ts    Typed content for cards, stats, sdk fns, tutorials
│   │   └── sections/     Hero, CategoryStrip, Protocol, HowItWorks, Stats, Sdk, Tutorials, Cta
│   └── Console/          Operator console — sidebar + topbar shell, nested screen routes
│       ├── ConsoleLayout.tsx
│       ├── Sidebar.tsx
│       ├── Topbar.tsx
│       ├── nav.ts        Nav items + route paths
│       ├── icons.tsx     Console-only SVGs
│       └── screens/      Fleet, Agents, Vaults, Activity, Services, Analytics, Sdk
├── styles/
│   └── main.css          @import "tailwindcss" + @theme tokens + custom utilities
├── types/
│   └── api.ts            Backend response shapes (Agent, Vault, Event, …)
└── lib/
    ├── cn.ts             Classnames helper
    ├── config.ts         VITE_API_BASE, VITE_USE_MOCKS — read-once, frozen
    ├── http.ts           Typed fetch wrapper (Authorization header, HttpError)
    ├── auth-store.ts     JWT in localStorage with subscribe()
    └── api/
        ├── client.ts     api.listAgents(), api.getVault(), … — every call goes through here
        ├── keys.ts       queryKeys.agent(pk), queryKeys.vaultActivity(pk), …
        └── mocks.ts      Seed data for VITE_USE_MOCKS=1
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

Set `VITE_USE_MOCKS=1` in `.env` to swap the API client for in-memory seed
data — useful when the backend isn't running.

## Design source

The handoff bundle (HTML/CSS prototype + chat transcripts) is preserved under
the design tool's archive. The React port is the source of truth from here on —
edit components, not the prototype.
