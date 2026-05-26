use anchor_lang::prelude::*;

use crate::errors::ReputationError;
use crate::events::FeedbackRevoked;
use crate::state::{AgentProfile, FeedbackRecord, ServiceRegistry};

// Only the original service may revoke its own feedback. The `has_one`
// constraints on `feedback_record` plus the `[b"service", service.key()]`
// seed re-derivation on `service_registry` together prove the signer is the
// feedback's original author.
#[derive(Accounts)]
#[instruction(payment_receipt_hash: [u8; 32])]
pub struct RevokeFeedback<'info> {
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
        mut,
        seeds = [b"feedback", payment_receipt_hash.as_ref()],
        bump = feedback_record.bump,
        has_one = agent_profile,
        has_one = service_registry,
    )]
    pub feedback_record: Box<Account<'info, FeedbackRecord>>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RevokeFeedback>, _payment_receipt_hash: [u8; 32]) -> Result<()> {
    let feedback = &mut ctx.accounts.feedback_record;
    require!(!feedback.revoked, ReputationError::AlreadyRevoked);

    let was_negative = feedback.value < 0;
    let slot = Clock::get()?.slot;

    feedback.revoked = true;
    feedback.last_modified_slot = slot;

    let feedback_key = feedback.key();

    let profile = &mut ctx.accounts.agent_profile;
    if was_negative {
        profile.active_negative_feedback_count = profile
            .active_negative_feedback_count
            .checked_sub(1)
            .ok_or(ReputationError::Overflow)?;
    }
    profile.last_active_slot = slot;

    ctx.accounts.service_registry.last_active_slot = slot;

    emit!(FeedbackRevoked {
        agent: profile.key(),
        service: ctx.accounts.service_registry.key(),
        feedback: feedback_key,
        was_negative,
        slot,
    });

    Ok(())
}
