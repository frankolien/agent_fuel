use anchor_lang::prelude::*;

#[error_code]
pub enum ReputationError {
    #[msg("Counter or amount overflow")]
    Overflow,
    #[msg("Service is not active")]
    ServiceInactive,
    #[msg("Payment amount must be greater than zero")]
    ZeroAmount,
    #[msg("A service may not rate itself or the agent owner")]
    SelfRating,
    #[msg("Receipt does not belong to this (agent, service) pair")]
    ReceiptMismatch,
    #[msg("Feedback value is outside the allowed range")]
    InvalidFeedbackValue,
    #[msg("Responder must be the agent or its owner")]
    UnauthorizedResponder,
    #[msg("Feedback already has a response")]
    AlreadyHasResponse,
}
