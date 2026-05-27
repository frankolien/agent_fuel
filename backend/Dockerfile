# syntax=docker/dockerfile:1.7
# Multi-stage build for the Agent Fuel backend.
#
# Stage 1 compiles the Actix-Web binary using the same Rust toolchain pinned
# in /rust-toolchain.toml. Stage 2 ships a minimal Debian image with just the
# binary + the TLS/CA bundles sqlx needs to reach Postgres over rustls.
#
# Build from the repo root so the workspace Cargo.lock is in context:
#   docker build -f backend/Dockerfile -t agent-fuel-backend .

FROM rust:1.89-bookworm AS builder
WORKDIR /app

# Workspace context. The backend crate depends only on workspace metadata
# (no Anchor build needed), so we can scope cargo build with -p.
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY backend backend
COPY programs programs

# Build only the backend binary. Solana programs in the workspace are not
# pulled in because they aren't deps of the backend crate.
RUN cargo build --release -p agent_fuel_backend --bin agent_fuel_backend

# --- runtime ---

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Non-root user: defence-in-depth in case a vulnerability escapes the actix
# worker. UID picked > 1000 to avoid collisions with host-provisioned users.
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin agentfuel

COPY --from=builder /app/target/release/agent_fuel_backend /usr/local/bin/agent_fuel_backend

USER agentfuel
EXPOSE 8080
ENV BIND_ADDR=0.0.0.0:8080 RUST_LOG=info

# `tini` would normally handle PID-1 signal forwarding, but actix-web's
# graceful-shutdown loop in main.rs already traps SIGINT/SIGTERM directly,
# so a static entrypoint is fine here.
ENTRYPOINT ["/usr/local/bin/agent_fuel_backend"]
