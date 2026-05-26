// why: Anchor 0.31's `#[program]` macro expands to a deprecated `AccountInfo::realloc` call.
// Crate scope is acceptable because this crate is exclusively an Anchor program.
// Removed when Anchor releases a version using `resize()`.
#![allow(deprecated)]

use anchor_lang::prelude::*;
use solana_security_txt::security_txt;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod policy;
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

    pub fn deposit(ctx: Context<Deposit>, amount_usdc: u64) -> Result<()> {
        instructions::deposit::handler(ctx, amount_usdc)
    }

    pub fn spend(ctx: Context<Spend>, amount_usdc: u64) -> Result<()> {
        instructions::spend::handler(ctx, amount_usdc)
    }

    pub fn freeze_vault(ctx: Context<FreezeVault>) -> Result<()> {
        instructions::freeze_vault::freeze_handler(ctx)
    }

    pub fn unfreeze_vault(ctx: Context<FreezeVault>) -> Result<()> {
        instructions::freeze_vault::unfreeze_handler(ctx)
    }

    pub fn update_policy(
        ctx: Context<UpdatePolicy>,
        new_per_tx_limit_usdc: u64,
        new_hourly_limit_usdc: u64,
        new_lifetime_limit_usdc: u64,
        new_allow_post_pay: bool,
        new_whitelist: [Pubkey; state::WHITELIST_LEN],
    ) -> Result<()> {
        instructions::update_policy::handler(
            ctx,
            new_per_tx_limit_usdc,
            new_hourly_limit_usdc,
            new_lifetime_limit_usdc,
            new_allow_post_pay,
            new_whitelist,
        )
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount_usdc: u64) -> Result<()> {
        instructions::withdraw::handler(ctx, amount_usdc)
    }

    pub fn claim(ctx: Context<Claim>, amount_usdc: u64) -> Result<()> {
        instructions::claim::handler(ctx, amount_usdc)
    }
}
