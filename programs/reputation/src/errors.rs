use anchor_lang::prelude::*;

#[error_code]
pub enum ReputationError {
    #[msg("Counter or amount overflow")]
    Overflow,
    #[msg("Service is not active")]
    ServiceInactive,
    #[msg("Payment amount must be greater than zero")]
    ZeroAmount,
}
