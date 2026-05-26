pub mod create_vault;
pub mod deposit;

// why: Anchor's #[program] macro discovers generated helpers via glob re-export.
// See reputation/src/instructions/mod.rs for the full reasoning.
#[allow(ambiguous_glob_reexports)]
pub use create_vault::*;
#[allow(ambiguous_glob_reexports)]
pub use deposit::*;
