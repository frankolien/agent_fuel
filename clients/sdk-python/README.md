# agent-fuel-sdk

Python SDK for [Agent Fuel](https://agentfuel.online) — credit vault + reputation primitives for AI agents on Solana.

> **Status:** `0.1.0` (alpha). Slice 1 ships read methods (`get_score`, `get_vault_balance`, `get_policy`, `check_service`). Action methods (`pay`, `request_spend`, `register_service`), WebSocket live events, and the x402 fetch wrapper land in subsequent slices. The TypeScript SDK ([`@agent-fuel/sdk`](https://www.npmjs.com/package/@agent-fuel/sdk)) is the reference for the full surface today.

## Install

```bash
pip install agent-fuel-sdk
```

Requires Python ≥ 3.10. Dependencies: `solders` (Rust-backed Solana types), `httpx` (async HTTP), `websockets` (live events, slice 3), `construct` (Borsh account parsing), `base58`.

## Read methods (slice 1)

```python
import asyncio

from solders.keypair import Keypair
from agent_fuel import AgentFuel, VaultRef


async def main() -> None:
    async with AgentFuel(
        agent=Keypair(),          # any keypair; reads don't sign
        cluster="devnet",
        owner="Cowi12EU2QhobEtJoAzHVEQewcnU4BYVAYdboHMPdWAe",
    ) as fuel:
        # REST snapshot — None for unscored agents.
        score = await fuel.get_score("5ro8Tb16gD8P7D975ZwMfUvABZvkqyLCF6wySvpTntZj")
        print(score.score, score.total_transactions)

        # On-chain account fetches. With `owner` set on the constructor,
        # no-arg calls default to the agent's own vault.
        vault = await fuel.get_vault_balance(
            VaultRef(
                owner="Cowi12EU2QhobEtJoAzHVEQewcnU4BYVAYdboHMPdWAe",
                agent="5ro8Tb16gD8P7D975ZwMfUvABZvkqyLCF6wySvpTntZj",
            )
        )
        print(vault.balance, vault.frozen, vault.pending_count)

        policy = await fuel.get_policy(
            VaultRef(
                owner="Cowi12EU2QhobEtJoAzHVEQewcnU4BYVAYdboHMPdWAe",
                agent="5ro8Tb16gD8P7D975ZwMfUvABZvkqyLCF6wySvpTntZj",
            )
        )
        print(policy.per_tx_limit_usdc, policy.whitelist)

        service = await fuel.check_service("...service authority pubkey...")
        print(service.name, service.category, service.active)


asyncio.run(main())
```

`fuel.close()` is called automatically by the context manager. If you can't use `async with`, call it yourself before your process exits.

## Errors

Every read raises `AccountNotFoundError` when the target doesn't exist on-chain or the backend returns 404. RPC and REST failures raise `HttpError`. Methods that need a vault owner without one configured raise `OwnerNotConfiguredError`. The full hierarchy mirrors [`@agent-fuel/sdk`](https://www.npmjs.com/package/@agent-fuel/sdk):

```python
from agent_fuel import (
    AccountNotFoundError,
    AgentFuelError,           # base
    HourlyLimitExceededError, # SpendPolicyError subclass (reserved for slice 2)
    HttpError,
    OwnerNotConfiguredError,
    PerTxLimitExceededError,
    SpendPolicyError,         # base for the six guardrail variants
    VaultFrozenError,
)
```

The `SpendPolicyError` subclasses surface only once `pay()` / `spend()` ship in slice 2.

## What's coming

| Slice | Methods |
|---|---|
| 1 (this) | `get_score` · `get_vault_balance` · `get_policy` · `check_service` |
| 2 | `pay` (atomic spend + record_payment + compute_score) · `request_spend` · `register_service` |
| 3 | `on_event` (WebSocket with reconnect) · `payment_required` (x402 fetch wrapper) |
| 4 | PyPI publish workflow · docs site Python section |

## License

Apache-2.0. See [`LICENSE`](../../LICENSE).
