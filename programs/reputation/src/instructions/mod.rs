pub mod append_response;
pub mod give_feedback;
pub mod initialize_agent;
pub mod record_payment;
pub mod register_service;

// why: Anchor's #[program] macro discovers generated helpers (`__client_accounts_*`,
// instruction args structs) through glob re-export. Each instruction module exposes a
// `handler` function; the ambiguity on that symbol is never exercised because
// `lib.rs` always calls handlers through fully-qualified paths.
#[allow(ambiguous_glob_reexports)]
pub use append_response::*;
#[allow(ambiguous_glob_reexports)]
pub use give_feedback::*;
#[allow(ambiguous_glob_reexports)]
pub use initialize_agent::*;
#[allow(ambiguous_glob_reexports)]
pub use record_payment::*;
#[allow(ambiguous_glob_reexports)]
pub use register_service::*;
