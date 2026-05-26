# Security Policy

## Reporting a vulnerability

**Do not file a public issue or pull request for security-sensitive defects.** Instead, email the maintainers privately at:

> **security@agentfuel.dev** *(placeholder — replaced with the project-final address before public release)*

Please include:

- A description of the issue and its impact.
- Reproduction steps or a proof-of-concept.
- The program (`reputation` or `credit_vault`), commit SHA, and cluster (localnet / devnet / mainnet) the issue affects.
- Whether you have already disclosed the issue to anyone else.

A GPG key for encrypted communication will be published here before mainnet deployment.

## Response process

We aim to respond within **72 hours** of receipt with an acknowledgement and an initial triage. We will keep you updated as we investigate and remediate.

Our disclosure window is **90 days** from the initial report. We will coordinate a public disclosure with you once a fix is deployed and (where applicable) sufficient time has passed for users to upgrade.

## Scope

In-scope:

- The two on-chain Anchor programs in [`programs/`](programs/).
- The off-chain backend (Phase 3+).
- The TypeScript SDK (Phase 4+).
- The web dashboard and mobile app (Phase 4+).

Out-of-scope (report upstream):

- Bugs in Anchor, Solana, the SPL Token Program, or other transitive dependencies.
- Vulnerabilities in third-party services (Helius, Firebase, Vercel, etc.) used as infrastructure.

## Supported versions

Pre-mainnet (current). Once `1.0.0` ships, the latest two minor versions of each program will receive security fixes.

## Audit status

Not audited. A full audit by a recognized Solana-focused firm is required before mainnet deployment (Phase 5).
