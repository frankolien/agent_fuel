use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::VaultError;
use crate::events::Spent;
use crate::state::{CreditVault, PendingSpend, SpendPolicy};

// `approve_spend` is the owner-signed half. It executes the SPL transfer
// recorded in `PendingSpend`, closes the PendingSpend (rent → owner), and
// emits the existing `Spent` event so the backend mirror, the alerts
// dispatcher, and the activity feed light up exactly as they would for a
// normal spend.
//
// Per-tx / hourly / lifetime limits are intentionally bypassed — that's the
// whole purpose of the approval. The vault token balance is still a hard
// cap (the SPL transfer fails if the vault is empty), and the whitelist is
// still enforced: the owner can override their own rate limits but the
// whitelist is the policy gate against compromised owner keys releasing
// funds to an unknown service.
//
// Frozen vaults reject approvals. If the owner wants to release a queued
// spend they must unfreeze first.
#[derive(Accounts)]
pub struct ApproveSpend<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref(), vault.agent.as_ref()],
        bump = vault.bump,
        has_one = owner,
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

    #[account(
        mut,
        constraint = vault_token_account.key() == vault.vault_token_account,
    )]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = service_token_account.owner == pending_spend.service,
        constraint = service_token_account.mint == vault.usdc_mint,
    )]
    pub service_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ApproveSpend>) -> Result<()> {
    require!(!ctx.accounts.vault.frozen, VaultError::Frozen);
    let amount_usdc = ctx.accounts.pending_spend.amount_usdc;
    require!(amount_usdc > 0, VaultError::ZeroAmount);

    crate::policy::check_whitelist(
        &ctx.accounts.policy.whitelist,
        &ctx.accounts.pending_spend.service,
    )?;

    let vault_key = ctx.accounts.vault.key();
    let pending_agent = ctx.accounts.pending_spend.agent;
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

    let slot = Clock::get()?.slot;
    let vault = &mut ctx.accounts.vault;
    vault.total_spent = vault
        .total_spent
        .checked_add(amount_usdc)
        .ok_or(VaultError::Overflow)?;
    vault.last_active_slot = slot;

    emit!(Spent {
        vault: vault_key,
        agent: pending_agent,
        service: ctx.accounts.pending_spend.service,
        amount_usdc,
        new_total_spent: vault.total_spent,
        slot,
    });

    Ok(())
}
