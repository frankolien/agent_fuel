# ADR-0002: Use Actix-Web for the backend instead of the PRD-specified Axum

## Status

Accepted.

## Context

The PRD (§7, §12) specifies Axum as the framework for the off-chain Rust service. Axum is a reasonable default in 2026 — it's built on Tower, lives inside the Tokio ecosystem, and has clean WebSocket extractors. Actix-Web is the older mainstream alternative, equally production-grade, with its own actor-flavoured middleware story and (historically) slightly higher raw throughput.

The operator on this project has materially more experience with Actix-Web than with Axum. Both frameworks fully satisfy the backend's actual requirements: HTTP REST handlers, WebSocket support, middleware for auth and rate limiting, SQLx + Redis clients, and a webhook receiver.

## Decision

Use **Actix-Web** for the backend service.

## Consequences

- **Faster delivery on Phase 3.** No framework-learning tax during the most setup-heavy phase. The backend ships sooner.
- **Slight ecosystem divergence from "default modern Rust web."** Some newer tutorials and crates assume Tower middleware. We use the Actix equivalents: `actix-governor` (rate limiting), `actix-cors` (CORS), `tracing-actix-web` (request tracing), `actix-web-actors::ws` (WebSocket).
- **No measurable performance impact** at the scale we're targeting (6-month goal: 1M spends, well within either framework's headroom).
- **PRD drift.** The PRD now lags reality on this point. We don't update the PRD (it's a versioned artifact) — instead, planning docs (`scope.md`, `phases.md`, `dependencies.md`) reflect the actual stack, and this ADR explains the divergence.
- **Onboarding cost** if another contributor joins who knows Axum but not Actix. Documented patterns in our own code mitigate this.

## Alternatives considered

- **Stick with Axum (PRD default).** Rejected: framework-learning cost during Phase 3 is real and not offset by any tangible gain for this project's scope.
- **Use a smaller framework (e.g. `poem`, `salvo`).** Rejected: smaller ecosystems, less battle-tested for the WebSocket + middleware mix we need.
- **No framework — raw `hyper`.** Rejected: middleware (auth, rate limiting, tracing) would all need to be hand-rolled. Not worth it for a service that does standard HTTP.
