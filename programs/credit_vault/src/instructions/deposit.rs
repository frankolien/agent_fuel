use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::VaultError;
use crate::events::Deposited;
use crate::state::CreditVault;

// Deposit is allowed on a frozen vault: `frozen` blocks `spend` and `claim`,
// not funding. The owner may want to top up before unfreezing.
//
// The vault token account is pinned by `constraint = key == vault.vault_token_account`,
// not via ATA derivation, because the vault stores its ATA at create time and
// re-deriving here would just cost CU for an identical result.
#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault", vault.owner.as_ref(), vault.agent.as_ref()],
        bump = vault.bump,
        has_one = owner,
    )]
    pub vault: Box<Account<'info, CreditVault>>,

    #[account(
        mut,
        constraint = owner_token_account.mint == vault.usdc_mint,
    )]
    pub owner_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = vault_token_account.key() == vault.vault_token_account,
    )]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Deposit>, amount_usdc: u64) -> Result<()> {
    require!(amount_usdc > 0, VaultError::ZeroAmount);

    let cpi_accounts = Transfer {
        from: ctx.accounts.owner_token_account.to_account_info(),
        to: ctx.accounts.vault_token_account.to_account_info(),
        authority: ctx.accounts.owner.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token::transfer(cpi_ctx, amount_usdc)?;

    let slot = Clock::get()?.slot;
    let vault = &mut ctx.accounts.vault;
    vault.total_deposited = vault
        .total_deposited
        .checked_add(amount_usdc)
        .ok_or(VaultError::Overflow)?;
    vault.last_active_slot = slot;

    emit!(Deposited {
        vault: vault.key(),
        owner: ctx.accounts.owner.key(),
        amount_usdc,
        new_total_deposited: vault.total_deposited,
        slot,
    });

    Ok(())
}
