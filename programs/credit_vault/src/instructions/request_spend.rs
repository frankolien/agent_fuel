use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

use crate::errors::VaultError;
use crate::events::SpendRequested;
use crate::state::{CreditVault, PendingSpend};

// `request_spend` is the agent-initiated half of the approve-spend flow. It
// records a payment intent (vault, service, amount) in a fresh `PendingSpend`
// PDA without moving any USDC. The owner later calls `approve_spend` (PDA
// signs the SPL transfer and closes the PendingSpend) or `cancel_spend`
// (closes without transferring).
//
// We deliberately do NOT enforce per_tx / hourly / lifetime limits here —
// the whole reason a request exists is that one of those limits would have
// blocked a direct `spend`. We DO refuse to queue requests on a frozen
// vault: a frozen vault should be inert, and silently accepting requests
// would let them surprise-execute the moment the owner unfreezes.
//
// We DO NOT enforce the whitelist here either: enforcement happens at
// approve time, where the owner has the same audit trail. Enforcing here
// would mean a compromised agent could exhaust rent paying for requests
// that can never approve.
#[derive(Accounts)]
pub struct RequestSpend<'info> {
    #[account(mut)]
    pub agent: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault", vault.owner.as_ref(), vault.agent.as_ref()],
        bump = vault.bump,
        has_one = agent,
    )]
    pub vault: Box<Account<'info, CreditVault>>,

    /// The recipient token account. We only need it for its `owner` field
    /// (the service pubkey we record in PendingSpend); mint constraint is
    /// belt-and-suspenders since `approve_spend` re-checks both.
    #[account(
        constraint = service_token_account.mint == vault.usdc_mint,
    )]
    pub service_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        init,
        payer = agent,
        space = PendingSpend::ACCOUNT_SIZE,
        seeds = [
            b"pending",
            vault.key().as_ref(),
            &vault.pending_count.to_le_bytes(),
        ],
        bump,
    )]
    pub pending_spend: Box<Account<'info, PendingSpend>>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RequestSpend>, amount_usdc: u64) -> Result<()> {
    require!(amount_usdc > 0, VaultError::ZeroAmount);
    require!(!ctx.accounts.vault.frozen, VaultError::Frozen);

    let slot = Clock::get()?.slot;
    let nonce = ctx.accounts.vault.pending_count;
    let vault_key = ctx.accounts.vault.key();
    let agent_key = ctx.accounts.agent.key();
    let service_key = ctx.accounts.service_token_account.owner;

    let pending = &mut ctx.accounts.pending_spend;
    pending.vault = vault_key;
    pending.agent = agent_key;
    pending.service = service_key;
    pending.amount_usdc = amount_usdc;
    pending.requested_slot = slot;
    pending.nonce = nonce;
    pending.bump = ctx.bumps.pending_spend;

    let vault = &mut ctx.accounts.vault;
    vault.pending_count = vault
        .pending_count
        .checked_add(1)
        .ok_or(VaultError::PendingNonceOverflow)?;
    vault.last_active_slot = slot;

    emit!(SpendRequested {
        vault: vault_key,
        agent: agent_key,
        service: service_key,
        pending_spend: pending.key(),
        amount_usdc,
        nonce,
        slot,
    });

    Ok(())
}
