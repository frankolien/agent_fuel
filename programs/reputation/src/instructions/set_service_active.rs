use anchor_lang::prelude::*;

use crate::events::ServiceActiveSet;
use crate::state::ServiceRegistry;

// Pause/resume a service. Only the service authority can flip the bit —
// a paused service is still discoverable (so existing whitelists keep
// resolving) but consumers know it's temporarily off.
#[derive(Accounts)]
pub struct SetServiceActive<'info> {
    pub service: Signer<'info>,

    #[account(
        mut,
        seeds = [b"service", service.key().as_ref()],
        bump = service_registry.bump,
        has_one = authority @ crate::errors::ReputationError::UnauthorizedService,
    )]
    pub service_registry: Account<'info, ServiceRegistry>,
    /// CHECK: equality enforced by `has_one = authority` above.
    pub authority: AccountInfo<'info>,
}

pub fn handler(ctx: Context<SetServiceActive>, active: bool) -> Result<()> {
    let slot = Clock::get()?.slot;
    let registry = &mut ctx.accounts.service_registry;
    registry.active = active;
    registry.last_active_slot = slot;

    emit!(ServiceActiveSet {
        service: registry.key(),
        active,
        slot,
    });

    Ok(())
}
