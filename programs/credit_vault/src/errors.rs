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
    #[msg("Pending spend belongs to a different vault")]
    PendingSpendVaultMismatch,
    #[msg("Pending spend counter would overflow")]
    PendingNonceOverflow,
}
/*https://claude.ai/design/p/d9deb5a3-04e6-465e-9790-21751c821439?file=Agent+Fuel+Mobile.html&via=share */
