// why: Anchor 0.31's `#[program]` macro expands to a deprecated `AccountInfo::realloc` call.
// We can't reach into the macro expansion to scope this narrowly. Crate scope is acceptable
// because (1) this crate is exclusively an Anchor program, so there's no unrelated code
// to mask, and (2) this is removed when Anchor releases a version using `resize()`.
#![allow(deprecated)]

use anchor_lang::prelude::*;
use solana_security_txt::security_txt;

pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ");

security_txt! {
    name: "Agent Fuel — Reputation Program",
    project_url: "https://github.com/frankolien/agent_fuel",
    contacts: "email:security@agentfuel.dev",
    policy: "https://github.com/frankolien/agent_fuel/blob/main/SECURITY.md",
    preferred_languages: "en",
    source_code: "https://github.com/frankolien/agent_fuel",
    auditors: "N/A"
}

#[program]
pub mod reputation {
    use super::*;

    pub fn initialize_agent(
        ctx: Context<InitializeAgent>,
        agent_uri: [u8; 128],
        external_agent_id: u64,
    ) -> Result<()> {
        instructions::initialize_agent::handler(ctx, agent_uri, external_agent_id)
    }
}
