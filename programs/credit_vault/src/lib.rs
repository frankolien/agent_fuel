// why: Anchor 0.31's `#[program]` macro expands to a deprecated `AccountInfo::realloc` call.
// Crate scope is acceptable because this crate is exclusively an Anchor program.
// Removed when Anchor releases a version using `resize()`.
#![allow(deprecated)]

use anchor_lang::prelude::*;
use solana_security_txt::security_txt;

pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("EsykPsafhHUeN7jA9DGqBiGuBsTBaFynLDVVpE4jFXDg");

security_txt! {
    name: "Agent Fuel — Credit Vault Program",
    project_url: "https://github.com/frankolien/agent_fuel",
    contacts: "email:security@agentfuel.dev",
    policy: "https://github.com/frankolien/agent_fuel/blob/main/SECURITY.md",
    preferred_languages: "en",
    source_code: "https://github.com/frankolien/agent_fuel",
    auditors: "N/A"
}

#[program]
pub mod credit_vault {
    use super::*;

    pub fn create_vault(
        ctx: Context<CreateVault>,
        per_tx_limit_usdc: u64,
        hourly_limit_usdc: u64,
        lifetime_limit_usdc: u64,
        allow_post_pay: bool,
    ) -> Result<()> {
        instructions::create_vault::handler(
            ctx,
            per_tx_limit_usdc,
            hourly_limit_usdc,
            lifetime_limit_usdc,
            allow_post_pay,
        )
    }
}
