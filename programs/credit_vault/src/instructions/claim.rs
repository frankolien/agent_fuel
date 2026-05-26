use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::VaultError;
use crate::events::Claimed;
use crate::policy::check_and_record_spend;
use crate::state::{CreditVault, SpendPolicy};

// Post-pay settlement: service has already delivered, now claims payment.
// Same six policy checks as `spend`, plus the `allow_post_pay` gate.
// Service signs; the service_token_account.owner must equal the signer.
#[derive(Accounts)]
pub struct Claim<'info> {
    pub service: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault", vault.owner.as_ref(), vault.agent.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Box<Account<'info, CreditVault>>,

    #[account(
        mut,
        seeds = [b"policy", vault.key().as_ref()],
        bump = policy.bump,
        constraint = policy.vault == vault.key(),
    )]
    pub policy: Box<Account<'info, SpendPolicy>>,

    #[account(
        mut,
        constraint = vault_token_account.key() == vault.vault_token_account,
    )]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = service_token_account.mint == vault.usdc_mint,
        constraint = service_token_account.owner == service.key(),
    )]
    pub service_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Claim>, amount_usdc: u64) -> Result<()> {
    require!(
        ctx.accounts.policy.allow_post_pay,
        VaultError::PostPayDisabled
    );

    let slot = Clock::get()?.slot;
    let service_key = ctx.accounts.service.key();
    let vault_key = ctx.accounts.vault.key();

    check_and_record_spend(
        &mut ctx.accounts.vault,
        &mut ctx.accounts.policy,
        &service_key,
        amount_usdc,
        slot,
    )?;

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
        to: ctx.accounts.service_token_account.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer,
    );
    token::transfer(cpi_ctx, amount_usdc)?;

    let vault = &mut ctx.accounts.vault;
    vault.total_claimed = vault
        .total_claimed
        .checked_add(amount_usdc)
        .ok_or(VaultError::Overflow)?;
    vault.last_active_slot = slot;

    emit!(Claimed {
        vault: vault_key,
        service: service_key,
        amount_usdc,
        new_total_spent: vault.total_spent,
        new_total_claimed: vault.total_claimed,
        slot,
    });

    Ok(())
}
