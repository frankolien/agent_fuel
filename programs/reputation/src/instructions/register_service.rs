use anchor_lang::prelude::*;

use crate::events::ServiceRegistered;
use crate::state::{ServiceCategory, ServiceRegistry};

// Identity and payer are split — same shape as `initialize_agent`.
//   • `sponsor` pays rent and submits the tx (typically the operator wallet
//     in the console, e.g. Phantom). Can be anyone with SOL.
//   • `service` is the long-lived signing identity. It's the pubkey that lives
//     in `SpendPolicy.whitelist`, signs `claim`, `give_feedback`, etc. It
//     co-signs registration so an attacker who knows the desired service
//     pubkey can't front-run and bind the PDA to themselves.
#[derive(Accounts)]
pub struct RegisterService<'info> {
    #[account(mut)]
    pub sponsor: Signer<'info>,

    pub service: Signer<'info>,

    #[account(
        init,
        payer = sponsor,
        space = ServiceRegistry::ACCOUNT_SIZE,
        seeds = [b"service", service.key().as_ref()],
        bump,
    )]
    pub service_registry: Account<'info, ServiceRegistry>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RegisterService>,
    name: [u8; 32],
    category: ServiceCategory,
    service_uri: [u8; 128],
) -> Result<()> {
    let slot = Clock::get()?.slot;
    let registry = &mut ctx.accounts.service_registry;

    registry.authority = ctx.accounts.service.key();
    registry.name = name;
    registry.service_uri = service_uri;
    registry.category = category;
    registry.active = true;
    registry.first_active_slot = slot;
    registry.last_active_slot = slot;
    registry.bump = ctx.bumps.service_registry;

    emit!(ServiceRegistered {
        service: ctx.accounts.service.key(),
        sponsor: ctx.accounts.sponsor.key(),
        name,
        category,
        init_slot: slot,
    });

    Ok(())
}
