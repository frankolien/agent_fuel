// LiteSVM integration tests for `revoke_feedback`.

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

// World ready for `revoke_feedback`: agent + service + payment + feedback.
struct Fixture {
    svm: LiteSVM,
    service: Keypair,
    agent_profile: Pubkey,
    service_registry: Pubkey,
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

fn setup_with_value(feedback_value: i8) -> Fixture {
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
    let feedback_record = derive_feedback_pda(&receipt_hash);

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
        svm.send_transaction(tx).expect("register failed");
    }
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
        svm.send_transaction(tx).expect("record failed");
    }
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
                value: feedback_value,
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
        svm.send_transaction(tx).expect("feedback failed");
    }

    Fixture {
        svm,
        service,
        agent_profile,
        service_registry,
        feedback_record,
        receipt_hash,
    }
}

fn build_revoke_ix(
    service: &Pubkey,
    agent_profile: &Pubkey,
    service_registry: &Pubkey,
    feedback_record: &Pubkey,
    payment_receipt_hash: [u8; 32],
) -> Instruction {
    let accounts = reputation::accounts::RevokeFeedback {
        service: *service,
        agent_profile: *agent_profile,
        service_registry: *service_registry,
        feedback_record: *feedback_record,
        system_program: System::id(),
    };
    let args = reputation::instruction::RevokeFeedback {
        payment_receipt_hash,
    };
    Instruction {
        program_id: reputation::ID,
        accounts: accounts.to_account_metas(None),
        data: args.data(),
    }
}

#[test]
fn revoke_feedback_negative_decrements_active_negative_count() {
    let Fixture {
        mut svm,
        service,
        agent_profile,
        service_registry,
        feedback_record,
        receipt_hash,
    } = setup_with_value(-70);

    // Pre-condition: negative feedback bumped the count to 1.
    let profile_before = AgentProfile::try_deserialize(
        &mut svm.get_account(&agent_profile).unwrap().data.as_slice(),
    )
    .unwrap();
    assert_eq!(profile_before.active_negative_feedback_count, 1);
    assert_eq!(profile_before.total_feedback_count, 1);

    let ix = build_revoke_ix(
        &service.pubkey(),
        &agent_profile,
        &service_registry,
        &feedback_record,
        receipt_hash,
    );
    let blockhash = svm.latest_blockhash();
    let tx =
        Transaction::new_signed_with_payer(&[ix], Some(&service.pubkey()), &[&service], blockhash);
    svm.send_transaction(tx).expect("revoke_feedback failed");

    let fb = FeedbackRecord::try_deserialize(
        &mut svm.get_account(&feedback_record).unwrap().data.as_slice(),
    )
    .unwrap();
    assert!(fb.revoked);
    assert!(fb.last_modified_slot >= fb.created_slot);

    let profile = AgentProfile::try_deserialize(
        &mut svm.get_account(&agent_profile).unwrap().data.as_slice(),
    )
    .unwrap();
    assert_eq!(
        profile.active_negative_feedback_count, 0,
        "revoke must decrement active_negative_feedback_count"
    );
    assert_eq!(
        profile.total_feedback_count, 1,
        "total_feedback_count must stay (revoked still counted in history)"
    );
}

#[test]
fn revoke_feedback_positive_does_not_decrement_negative_count() {
    let Fixture {
        mut svm,
        service,
        agent_profile,
        service_registry,
        feedback_record,
        receipt_hash,
    } = setup_with_value(80);

    let profile_before = AgentProfile::try_deserialize(
        &mut svm.get_account(&agent_profile).unwrap().data.as_slice(),
    )
    .unwrap();
    assert_eq!(profile_before.active_negative_feedback_count, 0);

    let ix = build_revoke_ix(
        &service.pubkey(),
        &agent_profile,
        &service_registry,
        &feedback_record,
        receipt_hash,
    );
    let blockhash = svm.latest_blockhash();
    let tx =
        Transaction::new_signed_with_payer(&[ix], Some(&service.pubkey()), &[&service], blockhash);
    svm.send_transaction(tx).expect("revoke_feedback failed");

    let fb = FeedbackRecord::try_deserialize(
        &mut svm.get_account(&feedback_record).unwrap().data.as_slice(),
    )
    .unwrap();
    assert!(fb.revoked);

    let profile = AgentProfile::try_deserialize(
        &mut svm.get_account(&agent_profile).unwrap().data.as_slice(),
    )
    .unwrap();
    assert_eq!(profile.active_negative_feedback_count, 0);
}

#[test]
fn revoke_feedback_rejects_double_revoke() {
    let Fixture {
        mut svm,
        service,
        agent_profile,
        service_registry,
        feedback_record,
        receipt_hash,
    } = setup_with_value(-30);

    let ix1 = build_revoke_ix(
        &service.pubkey(),
        &agent_profile,
        &service_registry,
        &feedback_record,
        receipt_hash,
    );
    let blockhash = svm.latest_blockhash();
    let tx1 = Transaction::new_signed_with_payer(
        std::slice::from_ref(&ix1),
        Some(&service.pubkey()),
        &[&service],
        blockhash,
    );
    svm.send_transaction(tx1)
        .expect("first revoke must succeed");

    svm.expire_blockhash();
    let ix2 = build_revoke_ix(
        &service.pubkey(),
        &agent_profile,
        &service_registry,
        &feedback_record,
        receipt_hash,
    );
    let blockhash = svm.latest_blockhash();
    let tx2 =
        Transaction::new_signed_with_payer(&[ix2], Some(&service.pubkey()), &[&service], blockhash);
    let result = svm.send_transaction(tx2);
    assert!(result.is_err(), "second revoke must be rejected");
}

#[test]
fn revoke_feedback_rejects_other_service() {
    // A different service tries to revoke our service's feedback. The
    // `has_one = service_registry` on feedback_record combined with the
    // seed re-derivation off `service.key()` makes this impossible to even
    // construct as a valid account list.
    let Fixture {
        mut svm,
        service: _,
        agent_profile,
        service_registry,
        feedback_record,
        receipt_hash,
    } = setup_with_value(-30);

    let attacker = Keypair::new();
    svm.airdrop(&attacker.pubkey(), 5 * LAMPORTS_PER_SOL)
        .unwrap();
    // Also register the attacker as a service so their service_registry PDA
    // exists; otherwise the failure is "account missing" rather than the
    // authorisation path we want to test.
    let attacker_registry = derive_service_pda(&attacker.pubkey());
    {
        let accounts = reputation::accounts::RegisterService {
            service: attacker.pubkey(),
            service_registry: attacker_registry,
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
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&attacker.pubkey()),
            &[&attacker],
            blockhash,
        );
        svm.send_transaction(tx).expect("register attacker failed");
    }

    // Attacker passes their own registry (matches the [b"service", attacker.key()]
    // seed derivation) but the feedback's has_one = service_registry will fail
    // because feedback.service_registry is the ORIGINAL service's PDA.
    let ix = build_revoke_ix(
        &attacker.pubkey(),
        &agent_profile,
        &attacker_registry,
        &feedback_record,
        receipt_hash,
    );
    let blockhash = svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&attacker.pubkey()),
        &[&attacker],
        blockhash,
    );
    let result = svm.send_transaction(tx);
    assert!(
        result.is_err(),
        "attacker revoking another service's feedback must be rejected"
    );

    // And the feedback must remain unrevoked.
    let fb = FeedbackRecord::try_deserialize(
        &mut svm.get_account(&feedback_record).unwrap().data.as_slice(),
    )
    .unwrap();
    assert!(!fb.revoked);
    assert_eq!(
        service_registry, fb.service_registry,
        "feedback must still point at the original service"
    );
}

#[test]
fn revoke_feedback_rejects_missing_signature() {
    let Fixture {
        mut svm,
        service,
        agent_profile,
        service_registry,
        feedback_record,
        receipt_hash,
    } = setup_with_value(-30);

    let other_payer = Keypair::new();
    svm.airdrop(&other_payer.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();

    let mut metas = reputation::accounts::RevokeFeedback {
        service: service.pubkey(),
        agent_profile,
        service_registry,
        feedback_record,
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
        data: reputation::instruction::RevokeFeedback {
            payment_receipt_hash: receipt_hash,
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
