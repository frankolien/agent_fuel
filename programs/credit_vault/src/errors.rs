use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Counter or amount overflow")]
    Overflow,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
}
