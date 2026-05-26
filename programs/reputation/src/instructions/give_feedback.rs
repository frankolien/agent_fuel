use anchor_lang::prelude::*;

use crate::errors::ReputationError;
use crate::events::FeedbackGiven;
use crate::state::{AgentProfile, AgentServiceLink, FeedbackRecord, ReceiptUsed, ServiceRegistry};

// Service-signed. The on-chain anti-self-rating check (ERC-8004 ADR-0003/0004)
// is expressed as Anchor `constraint`s on the agent_profile account, so the
// reject path uses the same error code regardless of which field collides.
//
// Receipt verification: the `agent_service_link` account is PDA-derived from
// `(agent_profile, service_registry)`. We then assert that the receipt's
// stored `agent_service_link` matches — proving this receipt belongs to *this*
// pair, not some other pair the signer wasn't part of.
#[derive(Accounts)]
#[instruction(
    payment_receipt_hash: [u8; 32],
    value: i8,
    tags: u32,
    evidence_uri: [u8; 128],
    evidence_hash: [u8; 32],
)]
pub struct GiveFeedback<'info> {
    #[account(mut)]
    pub service: Signer<'info>,

    // why: `Box`ed to keep this instruction's stack frame under Solana's
    // 4096-byte limit. AgentProfile (321 B) + FeedbackRecord (512 B) on the
    // stack pushes try_accounts past the limit; boxing reduces them to 8 B
    // pointers each.
    #[account(
        mut,
        seeds = [b"agent", agent_profile.authority.as_ref()],
        bump = agent_profile.bump,
        constraint = service.key() != agent_profile.owner @ ReputationError::SelfRating,
        constraint = service.key() != agent_profile.authority @ ReputationError::SelfRating,
    )]
    pub agent_profile: Box<Account<'info, AgentProfile>>,

    #[account(
        mut,
        seeds = [b"service", service.key().as_ref()],
        bump = service_registry.bump,
    )]
    pub service_registry: Account<'info, ServiceRegistry>,

    #[account(
        mut,
        seeds = [
            b"link",
            agent_profile.key().as_ref(),
            service_registry.key().as_ref(),
        ],
        bump = agent_service_link.bump,
    )]
    pub agent_service_link: Account<'info, AgentServiceLink>,

    #[account(
        seeds = [b"receipt", payment_receipt_hash.as_ref()],
        bump = receipt_used.bump,
    )]
    pub receipt_used: Account<'info, ReceiptUsed>,

    #[account(
        init,
        payer = service,
        space = FeedbackRecord::ACCOUNT_SIZE,
        seeds = [b"feedback", payment_receipt_hash.as_ref()],
        bump,
    )]
    pub feedback_record: Box<Account<'info, FeedbackRecord>>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<GiveFeedback>,
    payment_receipt_hash: [u8; 32],
    value: i8,
    tags: u32,
    evidence_uri: [u8; 128],
    evidence_hash: [u8; 32],
) -> Result<()> {
    require!(
        (FeedbackRecord::VALUE_MIN..=FeedbackRecord::VALUE_MAX).contains(&value),
        ReputationError::InvalidFeedbackValue
    );

    let link_key = ctx.accounts.agent_service_link.key();
    require!(
        ctx.accounts.receipt_used.agent_service_link == link_key,
        ReputationError::ReceiptMismatch
    );

    let slot = Clock::get()?.slot;

    // Rate limit: the explicit flag rather than a 0-slot sentinel — at genesis
    // (or in tests) real feedback can land at slot 0. `saturating_sub` is a
    // belt-and-braces against a hypothetical backwards-clock state.
    let link = &mut ctx.accounts.agent_service_link;
    if link.has_received_feedback {
        let elapsed = slot.saturating_sub(link.last_feedback_slot);
        require!(
            elapsed >= FeedbackRecord::FEEDBACK_RATE_LIMIT_SLOTS,
            ReputationError::FeedbackRateLimited
        );
    }
    link.last_feedback_slot = slot;
    link.has_received_feedback = true;
    let agent_key = ctx.accounts.agent_profile.key();
    let service_key = ctx.accounts.service_registry.key();
    let feedback_key = ctx.accounts.feedback_record.key();

    let feedback = &mut ctx.accounts.feedback_record;
    feedback.agent_profile = agent_key;
    feedback.service_registry = service_key;
    feedback.payment_receipt_hash = payment_receipt_hash;
    feedback.value = value;
    feedback.tags = tags;
    feedback.evidence_uri = evidence_uri;
    feedback.evidence_hash = evidence_hash;
    feedback.created_slot = slot;
    feedback.last_modified_slot = slot;
    feedback.bump = ctx.bumps.feedback_record;

    let profile = &mut ctx.accounts.agent_profile;
    profile.total_feedback_count = profile
        .total_feedback_count
        .checked_add(1)
        .ok_or(ReputationError::Overflow)?;
    if value < 0 {
        profile.active_negative_feedback_count = profile
            .active_negative_feedback_count
            .checked_add(1)
            .ok_or(ReputationError::Overflow)?;
        profile.consecutive_success = 0;
    }
    profile.last_active_slot = slot;

    ctx.accounts.service_registry.last_active_slot = slot;

    emit!(FeedbackGiven {
        agent: agent_key,
        service: service_key,
        feedback: feedback_key,
        payment_receipt_hash,
        value,
        tags,
        slot,
    });

    Ok(())
}
