use anchor_lang::prelude::*;

use crate::events::ServiceRegistered;
use crate::state::{ServiceCategory, ServiceRegistry};

#[derive(Accounts)]
pub struct RegisterService<'info> {
    #[account(mut)]
    pub service: Signer<'info>,

    #[account(
        init,
        payer = service,
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
) -> Result<()> {
    let slot = Clock::get()?.slot;
    let registry = &mut ctx.accounts.service_registry;

    registry.authority = ctx.accounts.service.key();
    registry.name = name;
    registry.category = category;
    registry.active = true;
    registry.first_active_slot = slot;
    registry.last_active_slot = slot;
    registry.bump = ctx.bumps.service_registry;

    emit!(ServiceRegistered {
        service: ctx.accounts.service.key(),
        name,
        category,
        init_slot: slot,
    });

    Ok(())
}
