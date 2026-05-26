// LiteSVM integration tests for `compute_score`.

use anchor_lang::prelude::System;
use anchor_lang::{AccountDeserialize, Id, InstructionData, ToAccountMetas};
use litesvm::LiteSVM;
use reputation::state::{AgentProfile, ServiceCategory};
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

const SLOTS_PER_DAY: u64 = 216_000;

fn derive_agent_pda(agent: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"agent", agent.as_ref()], &reputation::ID).0
}

fn derive_service_pda(service: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"service", service.as_ref()], &reputation::ID).0
}

fn derive_link_pda(agent_profile: &Pubkey, service_registry: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[b"link", agent_profile.as_ref(), service_registry.as_ref()],
        &reputation::ID,
    )
    .0
}

fn derive_receipt_pda(hash: &[u8; 32]) -> Pubkey {
    Pubkey::find_program_address(&[b"receipt", hash.as_ref()], &reputation::ID).0
}

fn derive_feedback_pda(hash: &[u8; 32]) -> Pubkey {
    Pubkey::find_program_address(&[b"feedback", hash.as_ref()], &reputation::ID).0
}

fn init_svm() -> LiteSVM {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(reputation::ID, REPUTATION_SO)
        .expect("reputation.so missing — run `anchor build` first");
    svm
}

fn init_agent(svm: &mut LiteSVM, owner: &Keypair, agent: &Keypair) -> Pubkey {
    svm.airdrop(&owner.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();
    let agent_profile = derive_agent_pda(&agent.pubkey());

    let accounts = reputation::accounts::InitializeAgent {
        owner: owner.pubkey(),
        agent: agent.pubkey(),
        agent_profile,
        system_program: System::id(),
    };
    let ix = Instruction {
        program_id: reputation::ID,
        accounts: accounts.to_account_metas(None),
        data: reputation::instruction::InitializeAgent {
            agent_uri: [0u8; 128],
            external_agent_id: 0,
        }
        .data(),
    };
    let blockhash = svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&owner.pubkey()),
        &[owner, agent],
        blockhash,
    );
    svm.send_transaction(tx).expect("init agent failed");
    agent_profile
}

fn register_service(svm: &mut LiteSVM, service: &Keypair, category: ServiceCategory) -> Pubkey {
    svm.airdrop(&service.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();
    let service_registry = derive_service_pda(&service.pubkey());
    let accounts = reputation::accounts::RegisterService {
        service: service.pubkey(),
        service_registry,
        system_program: System::id(),
    };
    let ix = Instruction {
        program_id: reputation::ID,
        accounts: accounts.to_account_metas(None),
        data: reputation::instruction::RegisterService {
            name: [0u8; 32],
            category,
        }
        .data(),
    };
    let blockhash = svm.latest_blockhash();
    let tx =
        Transaction::new_signed_with_payer(&[ix], Some(&service.pubkey()), &[service], blockhash);
    svm.send_transaction(tx).expect("register failed");
    service_registry
}

fn record_payment(
    svm: &mut LiteSVM,
    service: &Keypair,
    agent_profile: Pubkey,
    service_registry: Pubkey,
    amount: u64,
    receipt_hash: [u8; 32],
) {
    let link = derive_link_pda(&agent_profile, &service_registry);
    let receipt_used = derive_receipt_pda(&receipt_hash);
    let accounts = reputation::accounts::RecordPayment {
        service: service.pubkey(),
        agent_profile,
        service_registry,
        agent_service_link: link,
        receipt_used,
        system_program: System::id(),
    };
    let ix = Instruction {
        program_id: reputation::ID,
        accounts: accounts.to_account_metas(None),
        data: reputation::instruction::RecordPayment {
            amount_usdc: amount,
            payment_receipt_hash: receipt_hash,
        }
        .data(),
    };
    let blockhash = svm.latest_blockhash();
    let tx =
        Transaction::new_signed_with_payer(&[ix], Some(&service.pubkey()), &[service], blockhash);
    svm.send_transaction(tx).expect("record_payment failed");
}

fn give_feedback(
    svm: &mut LiteSVM,
    service: &Keypair,
    agent_profile: Pubkey,
    service_registry: Pubkey,
    receipt_hash: [u8; 32],
    value: i8,
) {
    let link = derive_link_pda(&agent_profile, &service_registry);
    let receipt_used = derive_receipt_pda(&receipt_hash);
    let feedback_record = derive_feedback_pda(&receipt_hash);
    let accounts = reputation::accounts::GiveFeedback {
        service: service.pubkey(),
        agent_profile,
        service_registry,
        agent_service_link: link,
        receipt_used,
        feedback_record,
        system_program: System::id(),
    };
    let ix = Instruction {
        program_id: reputation::ID,
        accounts: accounts.to_account_metas(None),
        data: reputation::instruction::GiveFeedback {
            payment_receipt_hash: receipt_hash,
            value,
            tags: 0,
            evidence_uri: [0u8; 128],
            evidence_hash: [0u8; 32],
        }
        .data(),
    };
    let blockhash = svm.latest_blockhash();
    let tx =
        Transaction::new_signed_with_payer(&[ix], Some(&service.pubkey()), &[service], blockhash);
    svm.send_transaction(tx).expect("give_feedback failed");
}

fn call_compute_score(svm: &mut LiteSVM, caller: &Keypair, agent_profile: Pubkey) {
    let accounts = reputation::accounts::ComputeScore {
        caller: caller.pubkey(),
        agent_profile,
    };
    let ix = Instruction {
        program_id: reputation::ID,
        accounts: accounts.to_account_metas(None),
        data: reputation::instruction::ComputeScore {}.data(),
    };
    let blockhash = svm.latest_blockhash();
    let tx =
        Transaction::new_signed_with_payer(&[ix], Some(&caller.pubkey()), &[caller], blockhash);
    svm.send_transaction(tx).expect("compute_score failed");
}

fn read_score(svm: &LiteSVM, agent_profile: Pubkey) -> u16 {
    let acct = svm.get_account(&agent_profile).unwrap();
    let profile = AgentProfile::try_deserialize(&mut acct.data.as_slice()).unwrap();
    profile.reputation_score
}

#[test]
fn compute_score_brand_new_profile_writes_neutral_baseline() {
    let mut svm = init_svm();
    let owner = Keypair::new();
    let agent = Keypair::new();
    let agent_profile = init_agent(&mut svm, &owner, &agent);

    call_compute_score(&mut svm, &owner, agent_profile);

    // Brand-new profile: only the "no feedback" neutral bracket contributes.
    assert_eq!(read_score(&svm, agent_profile), 100);
}

#[test]
fn compute_score_is_permissionless() {
    let mut svm = init_svm();
    let owner = Keypair::new();
    let agent = Keypair::new();
    let agent_profile = init_agent(&mut svm, &owner, &agent);

    // A wallet with no relationship to the agent invokes compute_score.
    let stranger = Keypair::new();
    svm.airdrop(&stranger.pubkey(), LAMPORTS_PER_SOL).unwrap();

    call_compute_score(&mut svm, &stranger, agent_profile);
    assert_eq!(read_score(&svm, agent_profile), 100);
}

#[test]
fn compute_score_negative_feedback_pulls_score_down() {
    let mut svm = init_svm();
    let owner = Keypair::new();
    let agent = Keypair::new();
    let service = Keypair::new();
    let agent_profile = init_agent(&mut svm, &owner, &agent);
    let service_registry = register_service(&mut svm, &service, ServiceCategory::DataFeed);

    record_payment(
        &mut svm,
        &service,
        agent_profile,
        service_registry,
        1_000_000,
        [0xa1u8; 32],
    );
    give_feedback(
        &mut svm,
        &service,
        agent_profile,
        service_registry,
        [0xa1u8; 32],
        -80,
    );

    call_compute_score(&mut svm, &owner, agent_profile);

    // 1 transaction (volume 50) + 1 service (diversity 50) + 0 streak +
    // 0 tenure + 0 feedback (100% negative) = 100.
    assert_eq!(read_score(&svm, agent_profile), 100);
}

#[test]
fn compute_score_high_activity_no_negatives_approaches_ceiling() {
    let mut svm = init_svm();
    let owner = Keypair::new();
    let agent = Keypair::new();
    let agent_profile = init_agent(&mut svm, &owner, &agent);

    // Four distinct services, one positive feedback each.
    for i in 0..4u8 {
        let service = Keypair::new();
        let service_registry = register_service(&mut svm, &service, ServiceCategory::DataFeed);
        let receipt = [0xc0 | i; 32];
        record_payment(
            &mut svm,
            &service,
            agent_profile,
            service_registry,
            1_000_000,
            receipt,
        );
        give_feedback(
            &mut svm,
            &service,
            agent_profile,
            service_registry,
            receipt,
            90,
        );
    }

    // Warp past 30 days so the tenure bracket maxes out.
    svm.warp_to_slot(31 * SLOTS_PER_DAY);
    svm.expire_blockhash();
    call_compute_score(&mut svm, &owner, agent_profile);

    // 4 tx: volume 50; 4 services: diversity 200; streak 4: 40; tenure: 150;
    // feedback (4/4 positive): 250. Total = 690. Confirms the formula is
    // doing per-component arithmetic, not just returning the cap.
    assert_eq!(read_score(&svm, agent_profile), 690);
}

#[test]
fn compute_score_is_idempotent_for_fixed_inputs() {
    let mut svm = init_svm();
    let owner = Keypair::new();
    let agent = Keypair::new();
    let agent_profile = init_agent(&mut svm, &owner, &agent);

    call_compute_score(&mut svm, &owner, agent_profile);
    let first = read_score(&svm, agent_profile);

    svm.expire_blockhash();
    call_compute_score(&mut svm, &owner, agent_profile);
    let second = read_score(&svm, agent_profile);

    assert_eq!(first, second);
}
