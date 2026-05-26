pub mod initialize_agent;
pub mod register_service;

// why: Anchor's #[program] macro discovers generated helpers (`__client_accounts_*`,
// instruction args structs) through glob re-export. Each instruction module exposes a
// `handler` function; the ambiguity on that symbol is never exercised because
// `lib.rs` always calls handlers through fully-qualified paths.
#[allow(ambiguous_glob_reexports)]
pub use initialize_agent::*;
#[allow(ambiguous_glob_reexports)]
pub use register_service::*;
