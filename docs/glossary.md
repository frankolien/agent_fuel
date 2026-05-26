# Glossary

Terms we use a lot. If a term is ambiguous on first encounter, add it here.

| Term | Meaning |
| --- | --- |
| **Agent** | An autonomous program (usually an LLM-driven workflow) that makes x402 payments on its own. Has a Solana keypair. |
| **Agent wallet** | The Solana pubkey the agent signs with. Calls the `spend` instruction. Limited permissions — cannot deposit or change policy. |
| **Owner** | The human (or org) who runs the agent. Funds the vault, sets the policy, can freeze or withdraw. Holds the more privileged keypair. |
| **Service / service provider** | An API or compute endpoint that accepts x402 payment. Registered in `ServiceRegistry`. Can file disputes. |
| **x402** | The HTTP-402-based stablecoin micropayment protocol from Coinbase + Cloudflare. The thing our `spend` instruction settles. |
| **PDA** | Program Derived Address. A deterministic Solana account derived from seeds + a program ID. Has no private key; the program signs for it via the bump. |
| **ATA** | Associated Token Account. The SPL Token account that holds USDC for a wallet or PDA. The vault's USDC is held in an ATA owned by the vault PDA. |
| **CPI** | Cross-Program Invocation. When our program calls another program (e.g., SPL Token's `transfer`). |
| **Vault** | A `CreditVault` PDA + its associated USDC ATA + its `SpendPolicy`. The agent's budgeted spending account. |
| **Policy** | The `SpendPolicy` PDA. Holds the limits: per-tx, per-hour, lifetime ceiling, whitelist, post-pay flag. |
| **Spend** | The instruction the agent calls when paying a service. Runs policy checks, then CPIs USDC to the service. |
| **Claim** | The post-pay instruction. A service submits accumulated usage; the vault pays if `allow_post_pay` is true. |
| **Post-pay** | Deferred settlement. Trusted agents (score ≥ 800) get served first, billed later in batches. |
| **Reputation score** | A 0–1000 number computed from on-chain counters by the formula in PRD §10.1. Written to `AgentProfile`. |
| **Crank** | A backend-signed instruction that updates on-chain state from off-chain computation. We use one for `record_payment`. |
| **SIWS** | Sign-In With Solana. The wallet-signature auth pattern we use for the REST API. |
| **Slice** | The unit of work in our build algorithm. One feature end-to-end. |
| **Slot** | Solana's time unit. ~400ms each. ~9,000 slots per hour. |
| **ERC-8004** | Ethereum standard for agent identity, reputation, and validation. *Not Ethereum-only* — it's a format (like USB) that any chain can implement. We adopt the *discoverability* shape so EVM tools recognise our agents, per [ADR-0003](decisions/0003-erc-8004-compatibility.md). |
| **FeedbackRecord** | Per-feedback PDA introduced by [ADR-0004](decisions/0004-dispute-and-feedback-model.md). Replaces the PRD's binary `record_dispute`. Holds a signed score, tags, the originating payment signature, evidence URI, and the agent's optional response URI. Revocable by the original service. |
| **Symmetric feedback** | Our dispute model: a service files feedback, the agent can attach a response, the service can revoke. No party has unilateral final say. Opposed to *blind feedback* (commit-reveal). |
| **agent_uri** | A URI on `AgentProfile` pointing to an off-chain ERC-8004 registration JSON file. Hosted on IPFS, Arweave, or HTTPS. |
