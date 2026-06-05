# agent-fuel-sdk

Python SDK for [Agent Fuel](https://agentfuel.online) — credit vault + reputation primitives for AI agents on Solana.

> **Status:** `0.2.0` (alpha). Slices 1–2 ship reads + actions: `get_score`, `get_vault_balance`, `get_policy`, `check_service`, **`pay`** (atomic spend + record_payment + compute_score), **`request_spend`**, **`register_service`**. WebSocket live events + the x402 fetch wrapper land in slice 3. The TypeScript SDK ([`@agent-fuel/sdk`](https://www.npmjs.com/package/@agent-fuel/sdk)) is the reference for the full surface today.

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

## Action methods (slice 2)

```python
import asyncio
from hashlib import sha256
from solders.keypair import Keypair
from agent_fuel import AgentFuel


async def main() -> None:
    agent = Keypair.from_json(open("agent.json").read())
    service = Keypair.from_json(open("svc-pyth.json").read())

    async with AgentFuel(agent=agent, cluster="devnet", owner="...your wallet...") as fuel:
        # Atomic spend + record_payment + compute_score. One tx, one fee,
        # vault burn and reputation accrual either both land or neither
        # does. Receipt hash must be unique per call — replays hit
        # ReceiptAlreadyRecordedError.
        result = await fuel.pay(
            service=service,
            amount_usdc=10_000,                         # micro-USDC (0.01)
            receipt_hash=sha256(b"tick-42").digest(),   # 32 bytes
        )
        print("paid:", result.signature)

        # Over-limit flow — owner approves from the mobile app.
        pending = await fuel.request_spend(
            service=service.pubkey(),
            amount_usdc=5_000_000,                       # 5 USDC
        )
        print("pending:", pending.pending_spend, "nonce:", pending.nonce)

        # Register a new service (two-signer).
        sponsor = Keypair.from_json(open("sponsor.json").read())
        new_service = Keypair()
        reg = await fuel.register_service(
            sponsor=sponsor,
            service=new_service,
            name="Helix RPC",
            category="Rpc",
            service_uri="https://helix.example/service.json",
        )
        print("registered:", new_service.pubkey(), "sig:", reg.signature)


asyncio.run(main())
```

The `SpendPolicyError` hierarchy is now active — `except SpendPolicyError` catches all six on-chain rejections (frozen / zero / whitelist / per-tx / hourly / lifetime) plus their pre-flight equivalents thrown by the local guardrail.

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
| 1 | `get_score` · `get_vault_balance` · `get_policy` · `check_service` |
| 2 (this) | `pay` (atomic spend + record_payment + compute_score) · `request_spend` · `register_service` |
| 3 | `on_event` (WebSocket with reconnect) · `payment_required` (x402 fetch wrapper) |
| 4 | PyPI publish workflow · docs site Python section |

## License

Apache-2.0. See [`LICENSE`](../../LICENSE).
