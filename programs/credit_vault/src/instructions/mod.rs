pub mod approve_spend;
pub mod cancel_spend;
pub mod claim;
pub mod create_vault;
pub mod deposit;
pub mod freeze_vault;
pub mod request_spend;
pub mod spend;
pub mod update_policy;
pub mod withdraw;

// why: Anchor's #[program] macro discovers generated helpers via glob re-export.
// See reputation/src/instructions/mod.rs for the full reasoning.
#[allow(ambiguous_glob_reexports)]
pub use approve_spend::*;
#[allow(ambiguous_glob_reexports)]
pub use cancel_spend::*;
#[allow(ambiguous_glob_reexports)]
pub use claim::*;
#[allow(ambiguous_glob_reexports)]
pub use create_vault::*;
#[allow(ambiguous_glob_reexports)]
pub use deposit::*;
#[allow(ambiguous_glob_reexports)]
pub use freeze_vault::*;
#[allow(ambiguous_glob_reexports)]
pub use request_spend::*;
#[allow(ambiguous_glob_reexports)]
pub use spend::*;
#[allow(ambiguous_glob_reexports)]
pub use update_policy::*;
#[allow(ambiguous_glob_reexports)]
pub use withdraw::*;
