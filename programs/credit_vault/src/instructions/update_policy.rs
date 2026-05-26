use anchor_lang::prelude::*;

use crate::events::PolicyUpdated;
use crate::state::{CreditVault, SpendPolicy, WHITELIST_LEN};

// Owner rewrites the policy in one shot. Rolling-window fields
// (`hourly_window_start_slot`, `hourly_window_spent_usdc`) are deliberately
// NOT touched — limit changes apply forward; in-flight windows keep their
// running totals, just measured against the new ceiling.
#[derive(Accounts)]
pub struct UpdatePolicy<'info> {
    pub owner: Signer<'info>,

    #[account(
        seeds = [b"vault", vault.owner.as_ref(), vault.agent.as_ref()],
        bump = vault.bump,
        has_one = owner,
    )]
    pub vault: Account<'info, CreditVault>,

    #[account(
        mut,
        seeds = [b"policy", vault.key().as_ref()],
        bump = policy.bump,
        constraint = policy.vault == vault.key(),
    )]
    pub policy: Box<Account<'info, SpendPolicy>>,
}

pub fn handler(
    ctx: Context<UpdatePolicy>,
    new_per_tx_limit_usdc: u64,
    new_hourly_limit_usdc: u64,
    new_lifetime_limit_usdc: u64,
    new_allow_post_pay: bool,
    new_whitelist: [Pubkey; WHITELIST_LEN],
) -> Result<()> {
    let policy = &mut ctx.accounts.policy;
    policy.per_tx_limit_usdc = new_per_tx_limit_usdc;
    policy.hourly_limit_usdc = new_hourly_limit_usdc;
    policy.lifetime_limit_usdc = new_lifetime_limit_usdc;
    policy.allow_post_pay = new_allow_post_pay;
    policy.whitelist = new_whitelist;

    let slot = Clock::get()?.slot;
    emit!(PolicyUpdated {
        vault: ctx.accounts.vault.key(),
        owner: ctx.accounts.owner.key(),
        per_tx_limit_usdc: new_per_tx_limit_usdc,
        hourly_limit_usdc: new_hourly_limit_usdc,
        lifetime_limit_usdc: new_lifetime_limit_usdc,
        allow_post_pay: new_allow_post_pay,
        whitelist: new_whitelist,
        slot,
    });
    Ok(())
}
