use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::VaultError;
use crate::events::Withdrawn;
use crate::state::CreditVault;

// Owner pulls funds out. Does NOT check `frozen`: freezing blocks `spend`
// and `claim`, not owner recovery. The owner can always retrieve their
// money.
#[derive(Accounts)]
pub struct Withdraw<'info> {
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
        constraint = vault_token_account.key() == vault.vault_token_account,
    )]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = owner_token_account.mint == vault.usdc_mint,
    )]
    pub owner_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Withdraw>, amount_usdc: u64) -> Result<()> {
    require!(amount_usdc > 0, VaultError::ZeroAmount);

    let owner_key = ctx.accounts.vault.owner;
    let vault_agent = ctx.accounts.vault.agent;
    let vault_bump = ctx.accounts.vault.bump;
    let signer_seeds: &[&[u8]] = &[
        b"vault",
        owner_key.as_ref(),
        vault_agent.as_ref(),
        std::slice::from_ref(&vault_bump),
    ];
    let signer = &[signer_seeds];

    let cpi_accounts = Transfer {
        from: ctx.accounts.vault_token_account.to_account_info(),
        to: ctx.accounts.owner_token_account.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer,
    );
    token::transfer(cpi_ctx, amount_usdc)?;

    let slot = Clock::get()?.slot;
    let vault = &mut ctx.accounts.vault;
    vault.total_withdrawn = vault
        .total_withdrawn
        .checked_add(amount_usdc)
        .ok_or(VaultError::Overflow)?;
    vault.last_active_slot = slot;

    emit!(Withdrawn {
        vault: vault.key(),
        owner: ctx.accounts.owner.key(),
        amount_usdc,
        new_total_withdrawn: vault.total_withdrawn,
        slot,
    });

    Ok(())
}
