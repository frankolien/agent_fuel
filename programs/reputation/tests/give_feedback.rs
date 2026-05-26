// LiteSVM integration tests for `give_feedback`.

use anchor_lang::prelude::System;
use anchor_lang::{AccountDeserialize, Id, InstructionData, ToAccountMetas};
use litesvm::LiteSVM;
use reputation::state::{AgentProfile, FeedbackRecord, ServiceCategory};
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

struct Fixture {
    svm: LiteSVM,
    service: Keypair,
    agent_profile: Pubkey,
    service_registry: Pubkey,
    agent_service_link: Pubkey,
    receipt_used: Pubkey,
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

// Builds a world with an initialized agent, a registered service, and one
// recorded payment between them — the precondition for `give_feedback`.
fn setup() -> Fixture {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(reputation::ID, REPUTATION_SO)
        .expect("reputation.so missing — run `anchor build` first");

    let owner = Keypair::new();
    let agent = Keypair::new();
    let service = Keypair::new();
    svm.airdrop(&owner.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();
    svm.airdrop(&service.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();

    let agent_profile = derive_agent_pda(&agent.pubkey());
    let service_registry = derive_service_pda(&service.pubkey());
    let agent_service_link = derive_link_pda(&agent_profile, &service_registry);
    let receipt_hash = [0x42u8; 32];
    let receipt_used = derive_receipt_pda(&receipt_hash);

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
            service: service.pubkey(),
            service_registry,
            system_program: System::id(),
        };
        let ix = Instruction {
            program_id: reputation::ID,
            accounts: accounts.to_account_metas(None),
            data: reputation::instruction::RegisterService {
                name: [0u8; 32],
                category: ServiceCategory::DataFeed,
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

    // record_payment — provides the ReceiptUsed PDA give_feedback needs.
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

    Fixture {
        svm,
        service,
        agent_profile,
        service_registry,
        agent_service_link,
        receipt_used,
        receipt_hash,
    }
}

#[allow(clippy::too_many_arguments)]
fn build_feedback_ix(
    service: &Pubkey,
    agent_profile: &Pubkey,
    service_registry: &Pubkey,
    agent_service_link: &Pubkey,
    receipt_used: &Pubkey,
    feedback_record: &Pubkey,
    payment_receipt_hash: [u8; 32],
    value: i8,
    tags: u32,
    evidence_uri: [u8; 128],
    evidence_hash: [u8; 32],
) -> Instruction {
    let accounts = reputation::accounts::GiveFeedback {
        service: *service,
        agent_profile: *agent_profile,
        service_registry: *service_registry,
        agent_service_link: *agent_service_link,
        receipt_used: *receipt_used,
        feedback_record: *feedback_record,
        system_program: System::id(),
    };
    let args = reputation::instruction::GiveFeedback {
        payment_receipt_hash,
        value,
        tags,
        evidence_uri,
        evidence_hash,
    };
    Instruction {
        program_id: reputation::ID,
        accounts: accounts.to_account_metas(None),
        data: args.data(),
    }
}

#[test]
fn give_feedback_happy_path_positive() {
    let Fixture {
        mut svm,
        service,
        agent_profile,
        service_registry,
        agent_service_link,
        receipt_used,
        receipt_hash,
    } = setup();
    let feedback_pda = derive_feedback_pda(&receipt_hash);

    let mut evidence_uri = [0u8; 128];
    let uri_text = b"ipfs://bafybeitestevidence";
    evidence_uri[..uri_text.len()].copy_from_slice(uri_text);
    let evidence_hash = [0x88u8; 32];

    let ix = build_feedback_ix(
        &service.pubkey(),
        &agent_profile,
        &service_registry,
        &agent_service_link,
        &receipt_used,
        &feedback_pda,
        receipt_hash,
        80,
        0b0000_0011,
        evidence_uri,
        evidence_hash,
    );
    let blockhash = svm.latest_blockhash();
    let tx =
        Transaction::new_signed_with_payer(&[ix], Some(&service.pubkey()), &[&service], blockhash);
    svm.send_transaction(tx).expect("give_feedback failed");

    let fb_acct = svm.get_account(&feedback_pda).expect("feedback missing");
    let fb = FeedbackRecord::try_deserialize(&mut fb_acct.data.as_slice()).unwrap();
    assert_eq!(fb.agent_profile, agent_profile);
    assert_eq!(fb.service_registry, service_registry);
    assert_eq!(fb.payment_receipt_hash, receipt_hash);
    assert_eq!(fb.value, 80);
    assert_eq!(fb.tags, 0b0000_0011);
    assert_eq!(fb.evidence_uri, evidence_uri);
    assert_eq!(fb.evidence_hash, evidence_hash);
    assert!(!fb.revoked);
    assert!(!fb.has_response);
    assert_eq!(fb.created_slot, fb.last_modified_slot);
    assert_eq!(fb_acct.data.len(), FeedbackRecord::ACCOUNT_SIZE);

    let profile = AgentProfile::try_deserialize(
        &mut svm.get_account(&agent_profile).unwrap().data.as_slice(),
    )
    .unwrap();
    assert_eq!(profile.total_feedback_count, 1);
    assert_eq!(
        profile.active_negative_feedback_count, 0,
        "positive feedback must not bump negative count"
    );
    assert_eq!(
        profile.consecutive_success, 1,
        "positive feedback must not reset streak"
    );
}

#[test]
fn give_feedback_negative_resets_streak_and_bumps_negative_count() {
    let Fixture {
        mut svm,
        service,
        agent_profile,
        service_registry,
        agent_service_link,
        receipt_used,
        receipt_hash,
    } = setup();
    let feedback_pda = derive_feedback_pda(&receipt_hash);

    let ix = build_feedback_ix(
        &service.pubkey(),
        &agent_profile,
        &service_registry,
        &agent_service_link,
        &receipt_used,
        &feedback_pda,
        receipt_hash,
        -50,
        0,
        [0u8; 128],
        [0u8; 32],
    );
    let blockhash = svm.latest_blockhash();
    let tx =
        Transaction::new_signed_with_payer(&[ix], Some(&service.pubkey()), &[&service], blockhash);
    svm.send_transaction(tx).expect("give_feedback failed");

    let profile = AgentProfile::try_deserialize(
        &mut svm.get_account(&agent_profile).unwrap().data.as_slice(),
    )
    .unwrap();
    assert_eq!(profile.total_feedback_count, 1);
    assert_eq!(profile.active_negative_feedback_count, 1);
    assert_eq!(
        profile.consecutive_success, 0,
        "negative feedback must reset streak"
    );
}

#[test]
fn give_feedback_rejects_self_rating_by_authority() {
    // The agent's authority IS the agent wallet. If a registered service also
    // happens to be that same keypair, give_feedback must reject — that's the
    // ERC-8004 anti-self-rating rule.
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(reputation::ID, REPUTATION_SO)
        .expect("reputation.so missing");

    // The same keypair plays the agent (authority) AND the service.
    let dual = Keypair::new();
    let owner = Keypair::new();
    svm.airdrop(&owner.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();
    svm.airdrop(&dual.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();

    let agent_profile = derive_agent_pda(&dual.pubkey());
    let service_registry = derive_service_pda(&dual.pubkey());
    let agent_service_link = derive_link_pda(&agent_profile, &service_registry);
    let receipt_hash = [0x77u8; 32];
    let receipt_used = derive_receipt_pda(&receipt_hash);
    let feedback_pda = derive_feedback_pda(&receipt_hash);

    // init agent (dual is the agent)
    {
        let accounts = reputation::accounts::InitializeAgent {
            owner: owner.pubkey(),
            agent: dual.pubkey(),
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
            &[&owner, &dual],
            blockhash,
        );
        svm.send_transaction(tx).expect("init failed");
    }
    // register service (dual is the service)
    {
        let accounts = reputation::accounts::RegisterService {
            service: dual.pubkey(),
            service_registry,
            system_program: System::id(),
        };
        let ix = Instruction {
            program_id: reputation::ID,
            accounts: accounts.to_account_metas(None),
            data: reputation::instruction::RegisterService {
                name: [0u8; 32],
                category: ServiceCategory::Other,
            }
            .data(),
        };
        let blockhash = svm.latest_blockhash();
        let tx =
            Transaction::new_signed_with_payer(&[ix], Some(&dual.pubkey()), &[&dual], blockhash);
        svm.send_transaction(tx).expect("register failed");
    }
    // record_payment (dual pays itself? that's the setup; we still need a receipt)
    {
        let accounts = reputation::accounts::RecordPayment {
            service: dual.pubkey(),
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
                amount_usdc: 1,
                payment_receipt_hash: receipt_hash,
            }
            .data(),
        };
        let blockhash = svm.latest_blockhash();
        let tx =
            Transaction::new_signed_with_payer(&[ix], Some(&dual.pubkey()), &[&dual], blockhash);
        svm.send_transaction(tx).expect("record failed");
    }

    // Now try give_feedback — dual is signing for both sides. Must reject.
    let ix = build_feedback_ix(
        &dual.pubkey(),
        &agent_profile,
        &service_registry,
        &agent_service_link,
        &receipt_used,
        &feedback_pda,
        receipt_hash,
        100,
        0,
        [0u8; 128],
        [0u8; 32],
    );
    let blockhash = svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(&[ix], Some(&dual.pubkey()), &[&dual], blockhash);
    let result = svm.send_transaction(tx);
    assert!(result.is_err(), "self-rating by authority must be rejected");
}

#[test]
fn give_feedback_rejects_self_rating_by_owner() {
    // Same idea but for the owner: an owner that ALSO operates a service
    // cannot rate their own agent.
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(reputation::ID, REPUTATION_SO)
        .expect("reputation.so missing");

    let owner = Keypair::new(); // also runs the service
    let agent = Keypair::new();
    svm.airdrop(&owner.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();
    svm.airdrop(&agent.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();

    let agent_profile = derive_agent_pda(&agent.pubkey());
    let service_registry = derive_service_pda(&owner.pubkey());
    let agent_service_link = derive_link_pda(&agent_profile, &service_registry);
    let receipt_hash = [0x55u8; 32];
    let receipt_used = derive_receipt_pda(&receipt_hash);
    let feedback_pda = derive_feedback_pda(&receipt_hash);

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
        svm.send_transaction(tx).expect("init failed");
    }
    {
        let accounts = reputation::accounts::RegisterService {
            service: owner.pubkey(),
            service_registry,
            system_program: System::id(),
        };
        let ix = Instruction {
            program_id: reputation::ID,
            accounts: accounts.to_account_metas(None),
            data: reputation::instruction::RegisterService {
                name: [0u8; 32],
                category: ServiceCategory::Other,
            }
            .data(),
        };
        let blockhash = svm.latest_blockhash();
        let tx =
            Transaction::new_signed_with_payer(&[ix], Some(&owner.pubkey()), &[&owner], blockhash);
        svm.send_transaction(tx).expect("register failed");
    }
    {
        let accounts = reputation::accounts::RecordPayment {
            service: owner.pubkey(),
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
                amount_usdc: 1,
                payment_receipt_hash: receipt_hash,
            }
            .data(),
        };
        let blockhash = svm.latest_blockhash();
        let tx =
            Transaction::new_signed_with_payer(&[ix], Some(&owner.pubkey()), &[&owner], blockhash);
        svm.send_transaction(tx).expect("record failed");
    }

    let ix = build_feedback_ix(
        &owner.pubkey(),
        &agent_profile,
        &service_registry,
        &agent_service_link,
        &receipt_used,
        &feedback_pda,
        receipt_hash,
        100,
        0,
        [0u8; 128],
        [0u8; 32],
    );
    let blockhash = svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(&[ix], Some(&owner.pubkey()), &[&owner], blockhash);
    let result = svm.send_transaction(tx);
    assert!(result.is_err(), "self-rating by owner must be rejected");
}

#[test]
fn give_feedback_rejects_value_out_of_range() {
    let Fixture {
        mut svm,
        service,
        agent_profile,
        service_registry,
        agent_service_link,
        receipt_used,
        receipt_hash,
    } = setup();
    let feedback_pda = derive_feedback_pda(&receipt_hash);

    let ix = build_feedback_ix(
        &service.pubkey(),
        &agent_profile,
        &service_registry,
        &agent_service_link,
        &receipt_used,
        &feedback_pda,
        receipt_hash,
        127, // i8::MAX is well above the +100 ceiling
        0,
        [0u8; 128],
        [0u8; 32],
    );
    let blockhash = svm.latest_blockhash();
    let tx =
        Transaction::new_signed_with_payer(&[ix], Some(&service.pubkey()), &[&service], blockhash);
    let result = svm.send_transaction(tx);
    assert!(result.is_err(), "value > 100 must be rejected");
}

#[test]
fn give_feedback_rejects_double_feedback_same_payment() {
    let Fixture {
        mut svm,
        service,
        agent_profile,
        service_registry,
        agent_service_link,
        receipt_used,
        receipt_hash,
    } = setup();
    let feedback_pda = derive_feedback_pda(&receipt_hash);

    let ix1 = build_feedback_ix(
        &service.pubkey(),
        &agent_profile,
        &service_registry,
        &agent_service_link,
        &receipt_used,
        &feedback_pda,
        receipt_hash,
        10,
        0,
        [0u8; 128],
        [0u8; 32],
    );
    let blockhash = svm.latest_blockhash();
    let tx1 = Transaction::new_signed_with_payer(
        std::slice::from_ref(&ix1),
        Some(&service.pubkey()),
        &[&service],
        blockhash,
    );
    svm.send_transaction(tx1)
        .expect("first feedback must succeed");

    svm.expire_blockhash();
    let ix2 = build_feedback_ix(
        &service.pubkey(),
        &agent_profile,
        &service_registry,
        &agent_service_link,
        &receipt_used,
        &feedback_pda,
        receipt_hash,
        -10,
        0,
        [0u8; 128],
        [0u8; 32],
    );
    let blockhash = svm.latest_blockhash();
    let tx2 =
        Transaction::new_signed_with_payer(&[ix2], Some(&service.pubkey()), &[&service], blockhash);
    let result = svm.send_transaction(tx2);
    assert!(
        result.is_err(),
        "second feedback for the same payment must be rejected"
    );
}

#[test]
fn give_feedback_rejects_missing_service_signature() {
    let Fixture {
        mut svm,
        service,
        agent_profile,
        service_registry,
        agent_service_link,
        receipt_used,
        receipt_hash,
    } = setup();
    let feedback_pda = derive_feedback_pda(&receipt_hash);

    let other_payer = Keypair::new();
    svm.airdrop(&other_payer.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();

    let mut metas = reputation::accounts::GiveFeedback {
        service: service.pubkey(),
        agent_profile,
        service_registry,
        agent_service_link,
        receipt_used,
        feedback_record: feedback_pda,
        system_program: System::id(),
    }
    .to_account_metas(None);
    for meta in metas.iter_mut() {
        if meta.pubkey == service.pubkey() {
            meta.is_signer = false;
        }
    }

    let ix = Instruction {
        program_id: reputation::ID,
        accounts: metas,
        data: reputation::instruction::GiveFeedback {
            payment_receipt_hash: receipt_hash,
            value: 10,
            tags: 0,
            evidence_uri: [0u8; 128],
            evidence_hash: [0u8; 32],
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
    assert!(result.is_err(), "missing service signature must fail");
}
