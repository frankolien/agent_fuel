// LiteSVM integration tests for `append_response`.

use anchor_lang::prelude::System;
use anchor_lang::{AccountDeserialize, Id, InstructionData, ToAccountMetas};
use litesvm::LiteSVM;
use reputation::state::{FeedbackRecord, ServiceCategory};
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

// World ready for `append_response`: agent initialised, service registered,
// one payment recorded, one feedback already filed by the service.
struct Fixture {
    svm: LiteSVM,
    owner: Keypair,
    agent: Keypair,
    agent_profile: Pubkey,
    feedback_record: Pubkey,
    receipt_hash: [u8; 32],
}

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

fn setup() -> Fixture {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(reputation::ID, REPUTATION_SO)
        .expect("reputation.so missing — run `anchor build` first");

    let owner = Keypair::new();
    let agent = Keypair::new();
    let service = Keypair::new();
    svm.airdrop(&owner.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();
    svm.airdrop(&agent.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();
    svm.airdrop(&service.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();

    let agent_profile = derive_agent_pda(&agent.pubkey());
    let service_registry = derive_service_pda(&service.pubkey());
    let agent_service_link = derive_link_pda(&agent_profile, &service_registry);
    let receipt_hash = [0x42u8; 32];
    let receipt_used = derive_receipt_pda(&receipt_hash);
    let feedback_record = derive_feedback_pda(&receipt_hash);

    // initialize_agent
    {
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
            &[&owner, &agent],
            blockhash,
        );
        svm.send_transaction(tx).expect("init agent failed");
    }

    // register_service
    {
        let accounts = reputation::accounts::RegisterService {
            sponsor: service.pubkey(),
            service: service.pubkey(),
            service_registry,
            system_program: System::id(),
        };
        let ix = Instruction {
            program_id: reputation::ID,
            accounts: accounts.to_account_metas(None),
            data: reputation::instruction::RegisterService {
                name: [0u8; 32],
                category: ServiceCategory::Compute,
                service_uri: [0u8; 128],
            }
            .data(),
        };
        let blockhash = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&service.pubkey()),
            &[&service],
            blockhash,
        );
        svm.send_transaction(tx).expect("register service failed");
    }

    // record_payment
    {
        let accounts = reputation::accounts::RecordPayment {
            service: service.pubkey(),
            agent_profile,
            service_registry,
            agent_service_link,
            receipt_used,
            system_program: System::id(),
        };
        let ix = Instruction {
            program_id: reputation::ID,
            accounts: accounts.to_account_metas(None),
            data: reputation::instruction::RecordPayment {
                amount_usdc: 1_000_000,
                payment_receipt_hash: receipt_hash,
            }
            .data(),
        };
        let blockhash = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&service.pubkey()),
            &[&service],
            blockhash,
        );
        svm.send_transaction(tx).expect("record_payment failed");
    }

    // give_feedback (negative — the interesting case for response)
    {
        let accounts = reputation::accounts::GiveFeedback {
            service: service.pubkey(),
            agent_profile,
            service_registry,
            agent_service_link,
            receipt_used,
            feedback_record,
            system_program: System::id(),
        };
        let ix = Instruction {
            program_id: reputation::ID,
            accounts: accounts.to_account_metas(None),
            data: reputation::instruction::GiveFeedback {
                payment_receipt_hash: receipt_hash,
                value: -60,
                tags: 0,
                evidence_uri: [0u8; 128],
                evidence_hash: [0u8; 32],
            }
            .data(),
        };
        let blockhash = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&service.pubkey()),
            &[&service],
            blockhash,
        );
        svm.send_transaction(tx).expect("give_feedback failed");
    }

    Fixture {
        svm,
        owner,
        agent,
        agent_profile,
        feedback_record,
        receipt_hash,
    }
}

fn build_append_ix(
    responder: &Pubkey,
    agent_profile: &Pubkey,
    feedback_record: &Pubkey,
    payment_receipt_hash: [u8; 32],
    response_uri: [u8; 128],
    response_hash: [u8; 32],
) -> Instruction {
    let accounts = reputation::accounts::AppendResponse {
        responder: *responder,
        agent_profile: *agent_profile,
        feedback_record: *feedback_record,
        system_program: System::id(),
    };
    let args = reputation::instruction::AppendResponse {
        payment_receipt_hash,
        response_uri,
        response_hash,
    };
    Instruction {
        program_id: reputation::ID,
        accounts: accounts.to_account_metas(None),
        data: args.data(),
    }
}

#[test]
fn append_response_happy_path_by_owner() {
    let Fixture {
        mut svm,
        owner,
        agent: _,
        agent_profile,
        feedback_record,
        receipt_hash,
    } = setup();

    let mut response_uri = [0u8; 128];
    let uri_text = b"ipfs://bafybeitestresponse";
    response_uri[..uri_text.len()].copy_from_slice(uri_text);
    let response_hash = [0x99u8; 32];

    let ix = build_append_ix(
        &owner.pubkey(),
        &agent_profile,
        &feedback_record,
        receipt_hash,
        response_uri,
        response_hash,
    );
    let blockhash = svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(&[ix], Some(&owner.pubkey()), &[&owner], blockhash);
    svm.send_transaction(tx).expect("append_response failed");

    let fb_acct = svm.get_account(&feedback_record).unwrap();
    let fb = FeedbackRecord::try_deserialize(&mut fb_acct.data.as_slice()).unwrap();
    assert_eq!(fb.response_uri, response_uri);
    assert_eq!(fb.response_hash, response_hash);
    assert!(fb.has_response);
    assert!(fb.last_modified_slot >= fb.created_slot);
}

#[test]
fn append_response_happy_path_by_agent_authority() {
    let Fixture {
        mut svm,
        owner: _,
        agent,
        agent_profile,
        feedback_record,
        receipt_hash,
    } = setup();

    let ix = build_append_ix(
        &agent.pubkey(),
        &agent_profile,
        &feedback_record,
        receipt_hash,
        [0u8; 128],
        [0u8; 32],
    );
    let blockhash = svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(&[ix], Some(&agent.pubkey()), &[&agent], blockhash);
    svm.send_transaction(tx)
        .expect("append_response by agent authority must succeed");

    let fb = FeedbackRecord::try_deserialize(
        &mut svm.get_account(&feedback_record).unwrap().data.as_slice(),
    )
    .unwrap();
    assert!(fb.has_response);
}

#[test]
fn append_response_rejects_third_party() {
    let Fixture {
        mut svm,
        owner: _,
        agent: _,
        agent_profile,
        feedback_record,
        receipt_hash,
    } = setup();

    let stranger = Keypair::new();
    svm.airdrop(&stranger.pubkey(), 5 * LAMPORTS_PER_SOL)
        .unwrap();

    let ix = build_append_ix(
        &stranger.pubkey(),
        &agent_profile,
        &feedback_record,
        receipt_hash,
        [0u8; 128],
        [0u8; 32],
    );
    let blockhash = svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&stranger.pubkey()),
        &[&stranger],
        blockhash,
    );
    let result = svm.send_transaction(tx);
    assert!(result.is_err(), "third-party responder must be rejected");
}

#[test]
fn append_response_rejects_second_append() {
    let Fixture {
        mut svm,
        owner,
        agent: _,
        agent_profile,
        feedback_record,
        receipt_hash,
    } = setup();

    let ix1 = build_append_ix(
        &owner.pubkey(),
        &agent_profile,
        &feedback_record,
        receipt_hash,
        [0u8; 128],
        [0u8; 32],
    );
    let blockhash = svm.latest_blockhash();
    let tx1 = Transaction::new_signed_with_payer(
        std::slice::from_ref(&ix1),
        Some(&owner.pubkey()),
        &[&owner],
        blockhash,
    );
    svm.send_transaction(tx1)
        .expect("first response must succeed");

    svm.expire_blockhash();
    let ix2 = build_append_ix(
        &owner.pubkey(),
        &agent_profile,
        &feedback_record,
        receipt_hash,
        [0xffu8; 128],
        [0xeeu8; 32],
    );
    let blockhash = svm.latest_blockhash();
    let tx2 =
        Transaction::new_signed_with_payer(&[ix2], Some(&owner.pubkey()), &[&owner], blockhash);
    let result = svm.send_transaction(tx2);
    assert!(result.is_err(), "second append must be rejected");
}

#[test]
fn append_response_rejects_missing_signature() {
    let Fixture {
        mut svm,
        owner,
        agent: _,
        agent_profile,
        feedback_record,
        receipt_hash,
    } = setup();

    let other_payer = Keypair::new();
    svm.airdrop(&other_payer.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();

    let mut metas = reputation::accounts::AppendResponse {
        responder: owner.pubkey(),
        agent_profile,
        feedback_record,
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
        data: reputation::instruction::AppendResponse {
            payment_receipt_hash: receipt_hash,
            response_uri: [0u8; 128],
            response_hash: [0u8; 32],
        }
        .data(),
    };
    let blockhash = svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&other_payer.pubkey()),
        &[&other_payer],
        blockhash,
    );
    let result = svm.send_transaction(tx);
    assert!(result.is_err(), "missing responder signature must fail");
}
