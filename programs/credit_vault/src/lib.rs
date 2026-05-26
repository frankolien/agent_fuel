#![allow(deprecated)]

use anchor_lang::prelude::*;
use solana_security_txt::security_txt;

declare_id!("EsykPsafhHUeN7jA9DGqBiGuBsTBaFynLDVVpE4jFXDg");

security_txt! {
    name: "Agent Fuel — Credit Vault Program",
    project_url: "https://github.com/TODO/agent_fuel",
    contacts: "email:security@agentfuel.dev",
    policy: "https://github.com/TODO/agent_fuel/blob/main/SECURITY.md",
    preferred_languages: "en",
    source_code: "https://github.com/TODO/agent_fuel",
    auditors: "N/A"
}

#[program]
pub mod credit_vault {}
