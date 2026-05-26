use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Counter or amount overflow")]
    Overflow,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Vault is frozen")]
    Frozen,
    #[msg("Service is not on the vault's whitelist")]
    NotWhitelisted,
    #[msg("Amount exceeds the per-transaction limit")]
    PerTxLimitExceeded,
    #[msg("Amount exceeds the hourly rolling-window limit")]
    HourlyLimitExceeded,
    #[msg("Amount would exceed the lifetime spend ceiling")]
    LifetimeLimitExceeded,
    #[msg("Vault is already frozen")]
    AlreadyFrozen,
    #[msg("Vault is not frozen")]
    NotFrozen,
    #[msg("Post-pay claims are disabled for this vault")]
    PostPayDisabled,
}
