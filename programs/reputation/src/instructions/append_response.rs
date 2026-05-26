use anchor_lang::prelude::*;

use crate::errors::ReputationError;
use crate::events::ResponseAppended;
use crate::state::{AgentProfile, FeedbackRecord};

// The agent OR its owner may respond — the agent runs autonomously and may
// reply to operational feedback, while the human owner retains override.
// Either path is normal; the constraint check covers both.
//
// `has_one = agent_profile` ties the feedback to *this* profile, so a
// responder authorised on agent A cannot smuggle in a feedback for agent B.
#[derive(Accounts)]
#[instruction(payment_receipt_hash: [u8; 32])]
pub struct AppendResponse<'info> {
    #[account(mut)]
    pub responder: Signer<'info>,

    #[account(
        mut,
        seeds = [b"agent", agent_profile.authority.as_ref()],
        bump = agent_profile.bump,
        constraint =
            responder.key() == agent_profile.owner
            || responder.key() == agent_profile.authority
            @ ReputationError::UnauthorizedResponder,
    )]
    pub agent_profile: Account<'info, AgentProfile>,

    #[account(
        mut,
        seeds = [b"feedback", payment_receipt_hash.as_ref()],
        bump = feedback_record.bump,
        has_one = agent_profile,
    )]
    pub feedback_record: Box<Account<'info, FeedbackRecord>>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<AppendResponse>,
    _payment_receipt_hash: [u8; 32],
    response_uri: [u8; 128],
    response_hash: [u8; 32],
) -> Result<()> {
    let feedback = &mut ctx.accounts.feedback_record;
    require!(!feedback.has_response, ReputationError::AlreadyHasResponse);

    let slot = Clock::get()?.slot;
    feedback.response_uri = response_uri;
    feedback.response_hash = response_hash;
    feedback.has_response = true;
    feedback.last_modified_slot = slot;

    let feedback_key = feedback.key();
    let agent_key = ctx.accounts.agent_profile.key();
    ctx.accounts.agent_profile.last_active_slot = slot;

    emit!(ResponseAppended {
        agent: agent_key,
        feedback: feedback_key,
        responder: ctx.accounts.responder.key(),
        slot,
    });

    Ok(())
}
