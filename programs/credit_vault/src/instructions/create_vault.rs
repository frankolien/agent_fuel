use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::events::VaultCreated;
use crate::state::{CreditVault, SpendPolicy};

// Owner-only signature. The agent doesn't need to consent because the vault
// holds the OWNER's USDC — the agent is just being granted spend rights they
// can ignore. Contrast with `initialize_agent` in the reputation program,
// where dual-sig prevents owner-squatting on the agent's PDA.
//
// `Box`ed accounts keep `try_accounts` under Solana's 4096-byte stack frame:
// CreditVault (250 B) + SpendPolicy (186 B) + TokenAccount (~165 B unpacked)
// + Mint (~80 B) sums close to the ceiling without boxing.
#[derive(Accounts)]
pub struct CreateVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: agent wallet. Not a signer — used as a PDA seed only. The
    /// account need not exist on chain; we never read or write its data.
    pub agent: UncheckedAccount<'info>,

    pub usdc_mint: Box<Account<'info, Mint>>,

    #[account(
        init,
        payer = owner,
        space = CreditVault::ACCOUNT_SIZE,
        seeds = [b"vault", owner.key().as_ref(), agent.key().as_ref()],
        bump,
    )]
    pub vault: Box<Account<'info, CreditVault>>,

    #[account(
        init,
        payer = owner,
        space = SpendPolicy::ACCOUNT_SIZE,
        seeds = [b"policy", vault.key().as_ref()],
        bump,
    )]
    pub policy: Box<Account<'info, SpendPolicy>>,

    #[account(
        init,
        payer = owner,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault,
    )]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateVault>,
    per_tx_limit_usdc: u64,
    hourly_limit_usdc: u64,
    lifetime_limit_usdc: u64,
    allow_post_pay: bool,
) -> Result<()> {
    let slot = Clock::get()?.slot;

    let vault_key = ctx.accounts.vault.key();
    let vault_token_account_key = ctx.accounts.vault_token_account.key();
    let owner_key = ctx.accounts.owner.key();
    let agent_key = ctx.accounts.agent.key();
    let mint_key = ctx.accounts.usdc_mint.key();

    let vault = &mut ctx.accounts.vault;
    vault.owner = owner_key;
    vault.agent = agent_key;
    vault.usdc_mint = mint_key;
    vault.vault_token_account = vault_token_account_key;
    vault.created_slot = slot;
    vault.last_active_slot = slot;
    vault.bump = ctx.bumps.vault;

    let policy = &mut ctx.accounts.policy;
    policy.vault = vault_key;
    policy.per_tx_limit_usdc = per_tx_limit_usdc;
    policy.hourly_limit_usdc = hourly_limit_usdc;
    policy.lifetime_limit_usdc = lifetime_limit_usdc;
    policy.allow_post_pay = allow_post_pay;
    policy.bump = ctx.bumps.policy;

    emit!(VaultCreated {
        vault: vault_key,
        owner: owner_key,
        agent: agent_key,
        usdc_mint: mint_key,
        vault_token_account: vault_token_account_key,
        slot,
    });

    Ok(())
}
