# Agent Fuel

> The credit and policy layer for x402 agents on Solana.

Agent Fuel is on-chain infrastructure that gives AI agent operators **budget control** over their agents and gives services a **reputation signal** to decide who to trust with deferred settlement. An owner funds an on-chain vault, sets per-transaction / hourly / lifetime spending limits, and lets their agent draw from it within those bounds. A reputation primitive — fed by payment history and ERC-8004-compatible service feedback — feeds back into credit decisions: trusted agents unlock **post-pay** (deferred settlement), reducing the per-call on-chain overhead of high-frequency agent workflows.

## Status

**Phase 1 of 5 — Foundation.** Anchor workspace scaffold; first instructions land in the next slice. Not deployed to Devnet yet. Not audited. Do not run with real funds.

Funded by a Solana Foundation grant.

## Project layout

```
agent_fuel/
├── programs/
│   ├── reputation/      # AgentProfile + ServiceRegistry + FeedbackRecord PDAs
│   └── credit_vault/    # CreditVault + SpendPolicy PDAs (USDC-denominated)
├── tests/               # TypeScript integration tests (Anchor)
├── Anchor.toml          # Anchor workspace config
├── Cargo.toml           # Rust workspace config
├── rust-toolchain.toml  # Pinned Rust toolchain
└── ...                  # Standard repo hygiene files
```

## Build & test

Prerequisites: Rust (managed via `rustup`, version pinned in `rust-toolchain.toml`), Solana CLI ≥ 3.1, Anchor CLI ≥ 0.31.

```bash
# Build both programs to BPF.
anchor build

# Run the Rust workspace tests (LiteSVM-based unit + slice tests).
cargo test --all

# Format and lint.
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings

# Run Anchor integration tests against solana-test-validator.
anchor test
```

## Architecture overview

Two on-chain Anchor programs, a Rust/Actix-Web indexer + REST/WS API backend, a React dashboard, a Flutter mobile app, and a TypeScript SDK. See the internal planning docs for the full design; the public-facing architecture summary will land here once Phase 1 completes.

## Security

If you find a vulnerability, please follow [`SECURITY.md`](SECURITY.md). Do not file a public issue.

## License

Apache-2.0. See [`LICENSE`](LICENSE).

## Acknowledgements

Built on the shoulders of the Solana Foundation's tooling, the Anchor framework, and the broader x402 ecosystem. Design influenced by the public source of [SATI](https://github.com/cascade-protocol/sati) (Apache-2.0) — see internal references.
