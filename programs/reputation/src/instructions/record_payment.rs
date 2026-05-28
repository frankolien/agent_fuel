use anchor_lang::prelude::*;

use crate::errors::ReputationError;
use crate::events::PaymentRecorded;
use crate::state::{AgentProfile, AgentServiceLink, ReceiptUsed, ServiceRegistry};

// The service signs because it's the natural attester of the off-chain x402
// settlement. The registry is PDA-derived from `service.key()`, so if the
// signer isn't the registry's authority Anchor's seed check fails — no
// separate has_one constraint needed.
//
// `receipt_used` enforces single-use of each payment receipt hash. Its `init`
// constraint (not `init_if_needed`) is the replay defence: a second call with
// the same hash fails with `AccountAlreadyInUse`.
#[derive(Accounts)]
#[instruction(amount_usdc: u64, payment_receipt_hash: [u8; 32])]
pub struct RecordPayment<'info> {
    #[account(mut)]
    pub service: Signer<'info>,

    #[account(
        mut,
        seeds = [b"agent", agent_profile.authority.as_ref()],
        bump = agent_profile.bump,
    )]
    pub agent_profile: Account<'info, AgentProfile>,

    #[account(
        mut,
        seeds = [b"service", service.key().as_ref()],
        bump = service_registry.bump,
    )]
    pub service_registry: Account<'info, ServiceRegistry>,

    #[account(
        init_if_needed,
        payer = service,
        space = AgentServiceLink::ACCOUNT_SIZE,
        seeds = [
            b"link",
            agent_profile.key().as_ref(),
            service_registry.key().as_ref(),
        ],
        bump,
    )]
    pub agent_service_link: Account<'info, AgentServiceLink>,

    #[account(
        init,
        payer = service,
        space = ReceiptUsed::ACCOUNT_SIZE,
        seeds = [b"receipt", payment_receipt_hash.as_ref()],
        bump,
    )]
    pub receipt_used: Account<'info, ReceiptUsed>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RecordPayment>,
    amount_usdc: u64,
    payment_receipt_hash: [u8; 32],
) -> Result<()> {
    require!(amount_usdc > 0, ReputationError::ZeroAmount);

    let slot = Clock::get()?.slot;
    let agent_key = ctx.accounts.agent_profile.key();
    let agent_authority = ctx.accounts.agent_profile.authority;
    let service_key = ctx.accounts.service_registry.key();

    let registry = &mut ctx.accounts.service_registry;
    require!(registry.active, ReputationError::ServiceInactive);

    let link = &mut ctx.accounts.agent_service_link;
    let is_new_pair = link.agent == Pubkey::default();

    if is_new_pair {
        link.agent = agent_key;
        link.service = service_key;
        link.first_payment_slot = slot;
        link.bump = ctx.bumps.agent_service_link;
    }

    let profile = &mut ctx.accounts.agent_profile;

    if is_new_pair {
        profile.services_used = profile
            .services_used
            .checked_add(1)
            .ok_or(ReputationError::Overflow)?;
        registry.total_agents_served = registry
            .total_agents_served
            .checked_add(1)
            .ok_or(ReputationError::Overflow)?;
    }

    profile.total_transactions = profile
        .total_transactions
        .checked_add(1)
        .ok_or(ReputationError::Overflow)?;
    profile.total_volume_usdc = profile
        .total_volume_usdc
        .checked_add(amount_usdc)
        .ok_or(ReputationError::Overflow)?;
    profile.consecutive_success = profile
        .consecutive_success
        .checked_add(1)
        .ok_or(ReputationError::Overflow)?;
    profile.last_active_slot = slot;

    registry.total_volume_received_usdc = registry
        .total_volume_received_usdc
        .checked_add(amount_usdc)
        .ok_or(ReputationError::Overflow)?;
    registry.last_active_slot = slot;

    link.total_transactions = link
        .total_transactions
        .checked_add(1)
        .ok_or(ReputationError::Overflow)?;
    link.total_volume_usdc = link
        .total_volume_usdc
        .checked_add(amount_usdc)
        .ok_or(ReputationError::Overflow)?;
    link.last_payment_slot = slot;

    let receipt = &mut ctx.accounts.receipt_used;
    receipt.receipt_hash = payment_receipt_hash;
    receipt.agent_service_link = link.key();
    receipt.recorded_slot = slot;
    receipt.bump = ctx.bumps.receipt_used;

    emit!(PaymentRecorded {
        agent: agent_authority,
        service: service_key,
        amount_usdc,
        payment_receipt_hash,
        was_new_pair: is_new_pair,
        slot,
    });

    Ok(())
}
