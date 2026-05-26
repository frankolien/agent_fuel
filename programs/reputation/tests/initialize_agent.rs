// LiteSVM integration tests for `initialize_agent`.
//
// These tests load the compiled `.so` from `target/deploy/`, so they require
// `anchor build` to have run first. CI runs that step before invoking tests.

use anchor_lang::prelude::System;
use anchor_lang::{AccountDeserialize, Id, InstructionData, ToAccountMetas};
use litesvm::LiteSVM;
use reputation::state::AgentProfile;
use solana_sdk::{
    instruction::Instruction,
    native_token::LAMPORTS_PER_SOL,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
};

const REPUTATION_SO: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../target/deploy/reputation.so"
);

fn setup() -> (LiteSVM, Keypair, Keypair) {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(reputation::ID, REPUTATION_SO)
        .expect("reputation.so missing — run `anchor build` first");

    let owner = Keypair::new();
    let agent = Keypair::new();
    svm.airdrop(&owner.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();

    (svm, owner, agent)
}

fn derive_agent_profile_pda(agent: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"agent", agent.as_ref()], &reputation::ID).0
}

fn build_init_ix(
    owner: &Pubkey,
    agent: &Pubkey,
    agent_profile: &Pubkey,
    agent_uri: [u8; 128],
    external_agent_id: u64,
) -> Instruction {
    let accounts = reputation::accounts::InitializeAgent {
        owner: *owner,
        agent: *agent,
        agent_profile: *agent_profile,
        system_program: System::id(),
    };
    let args = reputation::instruction::InitializeAgent {
        agent_uri,
        external_agent_id,
    };
    Instruction {
        program_id: reputation::ID,
        accounts: accounts.to_account_metas(None),
        data: args.data(),
    }
}

#[test]
fn initialize_agent_happy_path() {
    let (mut svm, owner, agent) = setup();
    let agent_profile = derive_agent_profile_pda(&agent.pubkey());

    let mut uri = [0u8; 128];
    let uri_text = b"ipfs://bafybeigtest-registration-cid";
    uri[..uri_text.len()].copy_from_slice(uri_text);

    let ix = build_init_ix(&owner.pubkey(), &agent.pubkey(), &agent_profile, uri, 42);
    let blockhash = svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&owner.pubkey()),
        &[&owner, &agent],
        blockhash,
    );
    svm.send_transaction(tx).expect("init failed");

    let account = svm.get_account(&agent_profile).expect("profile missing");
    let profile = AgentProfile::try_deserialize(&mut account.data.as_slice()).unwrap();

    assert_eq!(profile.authority, agent.pubkey());
    assert_eq!(profile.owner, owner.pubkey());
    assert_eq!(profile.agent_uri, uri);
    assert_eq!(profile.external_agent_id, 42);
    assert_eq!(profile.total_transactions, 0);
    assert_eq!(profile.total_volume_usdc, 0);
    assert_eq!(profile.consecutive_success, 0);
    assert_eq!(profile.total_feedback_count, 0);
    assert_eq!(profile.active_negative_feedback_count, 0);
    assert_eq!(profile.services_used, 0);
    assert_eq!(profile.reputation_score, 0);
    assert_eq!(profile.first_active_slot, profile.last_active_slot);
    assert_eq!(account.data.len(), AgentProfile::ACCOUNT_SIZE);
}

#[test]
fn initialize_agent_rejects_re_init() {
    let (mut svm, owner, agent) = setup();
    let agent_profile = derive_agent_profile_pda(&agent.pubkey());

    let ix = build_init_ix(
        &owner.pubkey(),
        &agent.pubkey(),
        &agent_profile,
        [0u8; 128],
        0,
    );
    let blockhash = svm.latest_blockhash();
    let tx1 = Transaction::new_signed_with_payer(
        std::slice::from_ref(&ix),
        Some(&owner.pubkey()),
        &[&owner, &agent],
        blockhash,
    );
    svm.send_transaction(tx1).expect("first init must succeed");

    let blockhash = svm.latest_blockhash();
    let tx2 = Transaction::new_signed_with_payer(
        &[ix],
        Some(&owner.pubkey()),
        &[&owner, &agent],
        blockhash,
    );
    let result = svm.send_transaction(tx2);
    assert!(result.is_err(), "re-init must fail");
}

#[test]
fn initialize_agent_rejects_missing_agent_signature() {
    let (mut svm, owner, agent) = setup();
    let agent_profile = derive_agent_profile_pda(&agent.pubkey());

    let mut metas = reputation::accounts::InitializeAgent {
        owner: owner.pubkey(),
        agent: agent.pubkey(),
        agent_profile,
        system_program: System::id(),
    }
    .to_account_metas(None);
    for meta in metas.iter_mut() {
        if meta.pubkey == agent.pubkey() {
            meta.is_signer = false;
        }
    }

    let ix = Instruction {
        program_id: reputation::ID,
        accounts: metas,
        data: reputation::instruction::InitializeAgent {
            agent_uri: [0u8; 128],
            external_agent_id: 0,
        }
        .data(),
    };

    let blockhash = svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(&[ix], Some(&owner.pubkey()), &[&owner], blockhash);
    let result = svm.send_transaction(tx);
    assert!(result.is_err(), "missing agent signature must fail");
}

#[test]
fn initialize_agent_rejects_missing_owner_signature() {
    let (mut svm, owner, agent) = setup();
    svm.airdrop(&agent.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();
    let agent_profile = derive_agent_profile_pda(&agent.pubkey());

    let mut metas = reputation::accounts::InitializeAgent {
        owner: owner.pubkey(),
        agent: agent.pubkey(),
        agent_profile,
        system_program: System::id(),
    }
    .to_account_metas(None);
    for meta in metas.iter_mut() {
        if meta.pubkey == owner.pubkey() {
            meta.is_signer = false;
        }
    }

    let ix = Instruction {
        program_id: reputation::ID,
        accounts: metas,
        data: reputation::instruction::InitializeAgent {
            agent_uri: [0u8; 128],
            external_agent_id: 0,
        }
        .data(),
    };

    let blockhash = svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(&[ix], Some(&agent.pubkey()), &[&agent], blockhash);
    let result = svm.send_transaction(tx);
    assert!(result.is_err(), "missing owner signature must fail");
}
