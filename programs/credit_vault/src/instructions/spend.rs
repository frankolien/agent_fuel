use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::events::Spent;
use crate::policy::check_and_record_spend;
use crate::state::{CreditVault, SpendPolicy};

// Load-bearing primitive: the vault PDA signs the SPL token transfer CPI via
// `invoke_signed` using its own `[b"vault", owner, agent, bump]` seeds. Every
// flow that moves USDC out of the vault (`spend`, `claim`, `withdraw`) uses
// the same signer pattern.
//
// All six policy checks live in `policy::check_and_record_spend` so `spend`
// and `claim` can't drift on the auth surface.
#[derive(Accounts)]
pub struct Spend<'info> {
    pub agent: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault", vault.owner.as_ref(), vault.agent.as_ref()],
        bump = vault.bump,
        has_one = agent,
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
    )]
    pub service_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Spend>, amount_usdc: u64) -> Result<()> {
    let slot = Clock::get()?.slot;
    let service = ctx.accounts.service_token_account.owner;
    let vault_key = ctx.accounts.vault.key();
    let agent_key = ctx.accounts.agent.key();

    check_and_record_spend(
        &mut ctx.accounts.vault,
        &mut ctx.accounts.policy,
        &service,
        amount_usdc,
        slot,
    )?;

    // PDA-signed CPI transfer: the vault PDA acts as the source ATA's
    // authority, so it must sign the transfer with its own seeds.
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
    vault.last_active_slot = slot;

    emit!(Spent {
        vault: vault_key,
        agent: agent_key,
        service,
        amount_usdc,
        new_total_spent: vault.total_spent,
        slot,
    });

    Ok(())
}
