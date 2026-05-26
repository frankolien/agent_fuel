use anchor_lang::prelude::*;

use crate::errors::VaultError;
use crate::events::{VaultFrozen, VaultUnfrozen};
use crate::state::CreditVault;

// Two separate instructions (rather than a single toggle) so the caller's
// intent is explicit and indexers see distinct events. Idempotent flips
// would also hide ownership bugs at the call site.
#[derive(Accounts)]
pub struct FreezeVault<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault", vault.owner.as_ref(), vault.agent.as_ref()],
        bump = vault.bump,
        has_one = owner,
    )]
    pub vault: Account<'info, CreditVault>,
}

pub fn freeze_handler(ctx: Context<FreezeVault>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    require!(!vault.frozen, VaultError::AlreadyFrozen);
    vault.frozen = true;
    let slot = Clock::get()?.slot;
    vault.last_active_slot = slot;
    emit!(VaultFrozen {
        vault: vault.key(),
        owner: ctx.accounts.owner.key(),
        slot,
    });
    Ok(())
}

pub fn unfreeze_handler(ctx: Context<FreezeVault>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    require!(vault.frozen, VaultError::NotFrozen);
    vault.frozen = false;
    let slot = Clock::get()?.slot;
    vault.last_active_slot = slot;
    emit!(VaultUnfrozen {
        vault: vault.key(),
        owner: ctx.accounts.owner.key(),
        slot,
    });
    Ok(())
}
