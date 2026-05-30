use anchor_lang::prelude::*;

use crate::errors::VaultError;
use crate::events::SpendRejected;
use crate::state::{CreditVault, PendingSpend};

// `cancel_spend` is the explicit-reject path. Only the vault's owner can
// reject; the originating agent can't cancel its own request because the
// approval queue is the owner's veto surface. If the agent submitted by
// mistake the owner still needs to act.
//
// Rent → owner via `close = owner` (the owner is the long-term resource
// holder; the agent paid for the init but that's part of the agent's cost
// of doing business with this vault).
#[derive(Accounts)]
pub struct CancelSpend<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [b"vault", owner.key().as_ref(), vault.agent.as_ref()],
        bump = vault.bump,
        has_one = owner,
    )]
    pub vault: Box<Account<'info, CreditVault>>,

    #[account(
        mut,
        close = owner,
        seeds = [
            b"pending",
            vault.key().as_ref(),
            &pending_spend.nonce.to_le_bytes(),
        ],
        bump = pending_spend.bump,
        constraint = pending_spend.vault == vault.key()
            @ VaultError::PendingSpendVaultMismatch,
    )]
    pub pending_spend: Box<Account<'info, PendingSpend>>,
}

pub fn handler(ctx: Context<CancelSpend>) -> Result<()> {
    let slot = Clock::get()?.slot;
    emit!(SpendRejected {
        vault: ctx.accounts.vault.key(),
        owner: ctx.accounts.owner.key(),
        pending_spend: ctx.accounts.pending_spend.key(),
        nonce: ctx.accounts.pending_spend.nonce,
        slot,
    });
    Ok(())
}
