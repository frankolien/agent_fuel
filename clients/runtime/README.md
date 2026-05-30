# Agent Fuel — reference agent runtime

A minimal Rust binary that exercises `credit_vault::spend` end-to-end. Loads
an agent keypair, derives the on-chain PDAs, and submits a single spend tx.

The binary is intentionally small — it's both an integration sanity check
for the program deployment and a copy-pasteable reference for third-party
agent frameworks (Eliza, solana-agent-kit, custom Rust agents) that need to
spend from an Agent Fuel vault.

## Quick start (devnet)

1. Export an agent key from the mobile app's agent detail page. The export
   sheet writes the standard Solana 64-byte secret JSON array
   (`[seed(32) || pubkey(32)]`) to your clipboard — paste it into
   `~/.config/solana/agent.json`.

2. Make sure the agent has a few cents of devnet SOL for fees:
   ```sh
   solana airdrop 1 <agent-pubkey> --url https://api.devnet.solana.com
   ```

3. Dry-run first to confirm the derived accounts look right:
   ```sh
   cargo run -p agent_fuel_runtime -- \
     --agent-key ~/.config/solana/agent.json \
     --owner <your-wallet-pubkey> \
     --service <service-wallet-pubkey> \
     --amount 0.01 \
     --dry-run
   ```

4. Send for real:
   ```sh
   cargo run -p agent_fuel_runtime -- \
     --agent-key ~/.config/solana/agent.json \
     --owner <your-wallet-pubkey> \
     --service <service-wallet-pubkey> \
     --amount 0.01
   ```
   On success: `ok: <tx-signature>`. The mobile app's Fleet view will pick
   up the `Spent` event via the backend's Helius webhook and update TVL +
   reputation within ~5 seconds.

## Flags

All flags accept env vars (e.g. `AF_OWNER`, `AF_SERVICE`, `AF_AGENT_KEY`).
`--credit-vault-program` and `--usdc-mint` default to the Agent Fuel devnet
deployment.

## What it does not do (yet)

- `request_spend` — over-limit pending spends. Use the mobile Approve sheet
  to confirm those.
- `claim` — service-side withdrawal after `spend`. The service operator
  signs that, not the agent.
- Retry / backoff. One ix, one tx; failures bubble up to the shell.
- Service discovery. You pass the service pubkey explicitly.

Add them when a real agent integration needs them. The whole point is to
stay small.
