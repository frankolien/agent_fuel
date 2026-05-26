use anchor_lang::prelude::*;

use crate::events::AgentInitialized;
use crate::state::AgentProfile;

// Both owner and agent sign. Without the agent's co-signature, anyone who knows
// the agent pubkey could front-run and bind the PDA to themselves as owner.
#[derive(Accounts)]
pub struct InitializeAgent<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    pub agent: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = AgentProfile::ACCOUNT_SIZE,
        seeds = [b"agent", agent.key().as_ref()],
        bump,
    )]
    pub agent_profile: Account<'info, AgentProfile>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeAgent>,
    agent_uri: [u8; 128],
    external_agent_id: u64,
) -> Result<()> {
    let slot = Clock::get()?.slot;
    let profile = &mut ctx.accounts.agent_profile;

    profile.authority = ctx.accounts.agent.key();
    profile.owner = ctx.accounts.owner.key();
    profile.agent_uri = agent_uri;
    profile.external_agent_id = external_agent_id;
    profile.first_active_slot = slot;
    profile.last_active_slot = slot;
    profile.bump = ctx.bumps.agent_profile;

    emit!(AgentInitialized {
        agent: ctx.accounts.agent.key(),
        owner: ctx.accounts.owner.key(),
        init_slot: slot,
    });

    Ok(())
}
