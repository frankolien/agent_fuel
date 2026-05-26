use anchor_lang::prelude::*;

use crate::events::ScoreComputed;
use crate::state::AgentProfile;

// Permissionless: any signer may invoke this for any agent. The score is a
// pure function of `agent_profile`'s already-public counters, so gating on
// authority would just add friction without changing what the caller can
// learn.
#[derive(Accounts)]
pub struct ComputeScore<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [b"agent", agent_profile.authority.as_ref()],
        bump = agent_profile.bump,
    )]
    pub agent_profile: Account<'info, AgentProfile>,
}

// ----- Formula constants. See data-model.md for the rationale and brackets. ---

const VOLUME_WEIGHT: u32 = 250;
const DIVERSITY_WEIGHT: u32 = 200;
const STREAK_WEIGHT: u32 = 150;
const TENURE_WEIGHT: u32 = 150;
const FEEDBACK_WEIGHT: u32 = 250;
const MAX_SCORE: u32 = 1000;

const NEUTRAL_FEEDBACK_BONUS: u32 = 100;

const DIVERSITY_CAP: u16 = 4;
const DIVERSITY_PER_SERVICE: u32 = 50;

const STREAK_CAP: u32 = 15;
const STREAK_PER_SUCCESS: u32 = 10;

const SLOTS_PER_DAY: u64 = 216_000;

// Static invariants tying brackets to their declared weights. If a future
// edit changes a cap or per-unit value without re-deriving the weight, the
// build fails here rather than silently shifting score balance.
const _: () = assert!(DIVERSITY_PER_SERVICE * DIVERSITY_CAP as u32 == DIVERSITY_WEIGHT);
const _: () = assert!(STREAK_PER_SUCCESS * STREAK_CAP == STREAK_WEIGHT);
const _: () = assert!(
    VOLUME_WEIGHT + DIVERSITY_WEIGHT + STREAK_WEIGHT + TENURE_WEIGHT + FEEDBACK_WEIGHT == MAX_SCORE
);

fn volume_points(total_transactions: u64) -> u32 {
    match total_transactions {
        0 => 0,
        1..=9 => 50,
        10..=99 => 125,
        _ => VOLUME_WEIGHT,
    }
}

fn diversity_points(services_used: u16) -> u32 {
    DIVERSITY_PER_SERVICE.saturating_mul(services_used.min(DIVERSITY_CAP) as u32)
}

fn streak_points(consecutive_success: u32) -> u32 {
    STREAK_PER_SUCCESS.saturating_mul(consecutive_success.min(STREAK_CAP))
}

// Tenure measures *age* (registration to now), not "active span". An agent
// that's been registered for a year but had a quiet month still gets full
// tenure credit; gaming it requires sustaining a real on-chain identity.
fn tenure_points(first_slot: u64, current_slot: u64) -> u32 {
    let tenure = current_slot.saturating_sub(first_slot);
    match tenure {
        t if t < SLOTS_PER_DAY => 0,
        t if t < 7 * SLOTS_PER_DAY => 50,
        t if t < 30 * SLOTS_PER_DAY => 100,
        _ => TENURE_WEIGHT,
    }
}

fn feedback_points(total: u32, active_negative: u32) -> u32 {
    if total == 0 {
        return NEUTRAL_FEEDBACK_BONUS;
    }
    // active_negative is bounded by total (give_feedback only increments
    // active_negative when it also increments total), but use min() to keep
    // the function total even under hypothetical state corruption.
    let neg = active_negative.min(total);
    let penalty = (FEEDBACK_WEIGHT as u64 * neg as u64 / total as u64) as u32;
    FEEDBACK_WEIGHT.saturating_sub(penalty)
}

fn compute(profile: &AgentProfile, current_slot: u64) -> u16 {
    let v = volume_points(profile.total_transactions);
    let d = diversity_points(profile.services_used);
    let s = streak_points(profile.consecutive_success);
    let t = tenure_points(profile.first_active_slot, current_slot);
    let f = feedback_points(
        profile.total_feedback_count,
        profile.active_negative_feedback_count,
    );
    let raw = v
        .saturating_add(d)
        .saturating_add(s)
        .saturating_add(t)
        .saturating_add(f);
    raw.min(MAX_SCORE) as u16
}

pub fn handler(ctx: Context<ComputeScore>) -> Result<()> {
    let slot = Clock::get()?.slot;
    let score = compute(&ctx.accounts.agent_profile, slot);

    let profile = &mut ctx.accounts.agent_profile;
    profile.reputation_score = score;
    profile.last_active_slot = slot;

    emit!(ScoreComputed {
        agent: profile.key(),
        score,
        slot,
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_profile() -> AgentProfile {
        AgentProfile {
            authority: Pubkey::default(),
            owner: Pubkey::default(),
            agent_uri: [0u8; 128],
            external_agent_id: 0,
            total_transactions: 0,
            total_volume_usdc: 0,
            consecutive_success: 0,
            total_feedback_count: 0,
            active_negative_feedback_count: 0,
            services_used: 0,
            first_active_slot: 0,
            last_active_slot: 0,
            reputation_score: 0,
            bump: 0,
            _padding: [0u8; 64],
        }
    }

    #[test]
    fn new_profile_scores_neutral_feedback_bracket_only() {
        let p = empty_profile();
        assert_eq!(compute(&p, 0), 100);
    }

    #[test]
    fn maxed_profile_caps_at_1000() {
        let mut p = empty_profile();
        p.total_transactions = 1_000;
        p.services_used = 10;
        p.consecutive_success = 100;
        p.first_active_slot = 0;
        p.total_feedback_count = 50;
        p.active_negative_feedback_count = 0;
        assert_eq!(compute(&p, 30 * SLOTS_PER_DAY), 1000);
    }

    #[test]
    fn all_negative_feedback_zeroes_feedback_component() {
        let mut p = empty_profile();
        p.total_transactions = 100;
        p.total_feedback_count = 10;
        p.active_negative_feedback_count = 10;
        // 250 (volume) + 0 (others) + 0 (feedback) = 250
        assert_eq!(compute(&p, 0), 250);
    }

    #[test]
    fn half_negative_feedback_halves_feedback_component() {
        let mut p = empty_profile();
        p.total_feedback_count = 10;
        p.active_negative_feedback_count = 5;
        // 0 + 0 + 0 + 0 + 125 = 125
        assert_eq!(compute(&p, 0), 125);
    }

    #[test]
    fn diversity_caps_at_four_services() {
        let mut p = empty_profile();
        p.services_used = 100;
        // 0 + 200 + 0 + 0 + 100 = 300
        assert_eq!(compute(&p, 0), 300);
    }

    #[test]
    fn streak_caps_at_fifteen() {
        let mut p = empty_profile();
        p.consecutive_success = 100;
        // 0 + 0 + 150 + 0 + 100 = 250
        assert_eq!(compute(&p, 0), 250);
    }

    #[test]
    fn tenure_brackets() {
        let first_slot = 0u64;
        assert_eq!(tenure_points(first_slot, SLOTS_PER_DAY - 1), 0);
        assert_eq!(tenure_points(first_slot, SLOTS_PER_DAY), 50);
        assert_eq!(tenure_points(first_slot, 7 * SLOTS_PER_DAY), 100);
        assert_eq!(tenure_points(first_slot, 30 * SLOTS_PER_DAY), 150);
    }
}
