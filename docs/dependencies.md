# External Dependencies

> Everything we depend on outside our own code. Third-party services, accounts to create, API keys to manage, libraries that matter.
> Keep this current — when we add a new service, it goes here **before** it goes in any code.

Sections:

1. [Solana platform](#1-solana-platform)
2. [Helius (RPC + webhooks)](#2-helius-rpc--webhooks)
3. [Backend infrastructure](#3-backend-infrastructure)
4. [Firebase (push notifications)](#4-firebase-push-notifications)
5. [Frontend hosting & distribution](#5-frontend-hosting--distribution)
6. [Wallet & auth libraries](#6-wallet--auth-libraries)
7. [x402 protocol](#7-x402-protocol)
8. [Dev tooling](#8-dev-tooling)
9. [Phase 5 only — audit & store submissions](#9-phase-5-only--audit--store-submissions)
10. [Env var inventory](#10-env-var-inventory)
11. [Account checklist](#11-account-checklist)

---

## 1. Solana platform

| Item | Purpose | Needed by | Notes |
| --- | --- | --- | --- |
| **Solana CLI** | Local keygen, devnet airdrops, program deploy | Phase 1 day 1 | Install via `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"` |
| **Anchor CLI (≥ 0.30)** | Build, test, deploy Anchor programs | Phase 1 day 1 | Install via `avm` (Anchor Version Manager) |
| **solana-test-validator** | Local Solana node for slice testing | Phase 1 | Ships with the Solana CLI |
| **Devnet RPC** | First public deploy target | End of Phase 1 | Public endpoint is fine for early dev; switch to Helius once volume picks up |
| **Mainnet-beta RPC** | Production deploy | Phase 5 | Always via Helius — never public RPC in prod |
| **USDC mint address** | The token the vault holds and the `spend` instruction transfers | Phase 2 slice 2 | Devnet: use the [SPL Token Faucet USDC](https://spl-token-faucet.com/) or mint our own dev USDC. Mainnet: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`. Hardcode neither — read from env. |

## 2. Helius (RPC + webhooks)

The single most load-bearing third party. Used by both backend and (optionally) by clients for RPC.

| Item | Purpose | Needed by |
| --- | --- | --- |
| **Helius account** | One workspace, multiple API keys (dev / staging / prod) | Phase 3 |
| **Enhanced RPC URL** | Backend reads on-chain state; clients can also use it | Phase 3 |
| **Enhanced webhooks** | Push notifications to our Actix-Web service for every tx involving our two program IDs | Phase 3 slice 2 |
| **Webhook shared secret** | We verify every incoming webhook with this | Phase 3 slice 2 |

**Setup steps when we hit Phase 3:**
1. Create Helius project.
2. Generate API key, store as `HELIUS_API_KEY`.
3. Configure two webhooks (one per program ID) pointing at our backend's `/webhooks/helius` endpoint.
4. Store webhook auth header value as `HELIUS_WEBHOOK_SECRET`.

**Cost note:** free tier covers ~100k credits/day. Should comfortably cover dev + beta. Plan tier ($49/mo+) for sustained mainnet traffic.

## 3. Backend infrastructure

The Actix-Web service stack.

| Item | Purpose | Provider options | Phase |
| --- | --- | --- | --- |
| **Container hosting** | Run the Actix-Web binary | Fly.io (preferred — simple Rust deploys), Railway, Render | Phase 3 |
| **Postgres** | All indexed events, score history, mirror tables | Neon (preferred — branchable, generous free tier), Supabase | Phase 3 |
| **Redis** | Hot cache for reputation scores (5-min TTL) | Upstash (preferred — REST API works from anywhere, free tier OK for dev) | Phase 3 |

**Env vars expected:** `DATABASE_URL`, `REDIS_URL`.

**Decision deferred:** pick Fly.io vs Railway when we actually deploy. Write an ADR at that point.

## 4. Firebase (push notifications)

For mobile-app budget alerts and reputation change notifications.

| Item | Purpose | Needed by |
| --- | --- | --- |
| **Firebase project** | Container for FCM + app configs | Phase 3 slice 10 |
| **Service account JSON** | Backend sends FCM messages with this | Phase 3 slice 10 |
| **iOS app config (GoogleService-Info.plist)** | Flutter iOS build embeds this | Phase 4 |
| **Android app config (google-services.json)** | Flutter Android build embeds this | Phase 4 |
| **APNs key** | Required for iOS push to actually work | Phase 4 (before TestFlight) |

**Env var on backend:** `FCM_SERVICE_ACCOUNT_JSON` (the full JSON, base64-encoded for env-var safety, or path to a mounted file).

**Note:** the React web dashboard does **not** use FCM in v1 — web push is out of scope. Browser users see real-time WebSocket events while they have the tab open; missed events are catchable via the activity feed.

## 5. Frontend hosting & distribution

| Item | Purpose | Phase |
| --- | --- | --- |
| **Vercel** | React dashboard hosting | Phase 4 |
| **npm** | Publish `@agentfuel/sdk` | Phase 4 |
| **Apple Developer Program** | Required to ship the Flutter app to App Store ($99/yr) | Phase 5 |
| **Google Play Developer** | Required to ship the Flutter app to Play Store ($25 one-time) | Phase 5 |
| **TestFlight** | iOS beta distribution before App Store | Phase 4 (testing) |

## 6. Wallet & auth libraries

These are libraries, not services — listed here so we have a single source for what we depend on.

| Library | Where used | What it does |
| --- | --- | --- |
| `@solana/wallet-adapter-react` | React dashboard | Connect Phantom/Solflare/Backpack |
| `@solana-mobile/mobile-wallet-adapter-protocol` | Flutter app (via `solana_mobile_wallet_adapter` Dart pkg) | Mobile wallet signing |
| `@solana/web3.js` | React + SDK | Tx construction |
| `@coral-xyz/anchor` (TypeScript) | SDK + React | IDL-typed program client |
| `anchor-lang` (Rust) | On-chain programs | Anchor framework |
| `solana-sdk` (Dart, e.g. `solana` pkg) | Flutter | Tx construction client-side |
| **SIWS** | Backend auth | We implement this ourselves — it's a pattern, not a library. Sign-In With Solana = wallet signs a typed message, backend verifies + issues a short-lived JWT. |

## 7. x402 protocol

| Item | Status | Notes |
| --- | --- | --- |
| **x402 spec** | Public, maintained by Coinbase + Cloudflare | We integrate by implementing the `402` retry semantics in the SDK |
| **x402 facilitator** | Optional | PRD §9 step 9 mentions services can verify "on-chain or via x402 facilitator." We don't run a facilitator; service providers can use whichever they prefer. |

**Open question:** do we ship our own facilitator for services that don't have one? Listed as a Phase 6 idea, not v1. ADR if we revisit.

## 8. Dev tooling

| Tool | Why |
| --- | --- |
| **GitHub Actions** | CI — `anchor build`, `anchor test`, `cargo test`, frontend builds. Free for public repos. |
| **Rust toolchain** | `rustup` with `stable` + `nightly` (Anchor sometimes needs nightly features) |
| **Node ≥ 20** | TS SDK, React dashboard |
| **Flutter ≥ 3.22** | Mobile app |
| **Docker** | Local Postgres + Redis during backend dev, plus the production container image |
| **`sqlx-cli`** | Run Postgres migrations |
| **`pnpm`** | Frontend monorepo package manager (lighter than npm/yarn for our use) |

## 9. Phase 5 only — audit & store submissions

| Item | Purpose | Cost estimate |
| --- | --- | --- |
| **Smart contract audit firm** | Audit both Anchor programs before Mainnet-beta | $30–80k typical for two small programs (OtterSec, Halborn, Neodyme are common Solana picks) |
| **Apple Developer Program** | App Store submission | $99/yr |
| **Google Play Developer** | Play Store submission | $25 one-time |

## 10. Env var inventory

Single source of truth for every env var the backend reads. Update when adding a dep.

| Var | Used by | Where it comes from |
| --- | --- | --- |
| `DATABASE_URL` | Actix-Web | Neon/Supabase |
| `REDIS_URL` | Actix-Web | Upstash |
| `HELIUS_API_KEY` | Actix-Web (RPC reads) | Helius dashboard |
| `HELIUS_WEBHOOK_SECRET` | Actix-Web (webhook verify) | Helius dashboard |
| `SOLANA_RPC_URL` | Actix-Web, clients | Derived from `HELIUS_API_KEY` in prod, set to `http://localhost:8899` for local validator |
| `USDC_MINT` | Actix-Web, programs (via constant), SDK | Devnet vs Mainnet differ — config per env |
| `REPUTATION_PROGRAM_ID` | Actix-Web, SDK | From deploy |
| `CREDIT_VAULT_PROGRAM_ID` | Actix-Web, SDK | From deploy |
| `FCM_SERVICE_ACCOUNT_JSON` | Actix-Web | Firebase console |
| `JWT_SECRET` | Actix-Web (SIWS token signing) | Random, rotated per deploy |
| `RUST_LOG` | Actix-Web | `info` default, `debug` for local |

We'll keep a `.env.example` in the repo root with every var listed but no values.

## 11. Account checklist

What to provision, in the order we'll need it.

- [ ] **Phase 1:** Solana keypair for deployer (`solana-keygen new`)
- [ ] **Phase 3:** Helius account + API key + 2 webhooks
- [ ] **Phase 3:** Neon (or Supabase) Postgres
- [ ] **Phase 3:** Upstash Redis
- [ ] **Phase 3:** Fly.io (or Railway) project for the Actix-Web binary
- [ ] **Phase 3:** Firebase project + service account + APNs key
- [ ] **Phase 4:** Vercel project for the React dashboard
- [ ] **Phase 4:** npm org for `@agentfuel`
- [ ] **Phase 5:** Audit firm engaged
- [ ] **Phase 5:** Apple Developer Program enrolment
- [ ] **Phase 5:** Google Play Developer enrolment
- [ ] **Phase 5:** Domain + DNS for the docs site
