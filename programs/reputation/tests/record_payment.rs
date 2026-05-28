// LiteSVM integration tests for `record_payment`.

use anchor_lang::prelude::System;
use anchor_lang::{AccountDeserialize, Id, InstructionData, ToAccountMetas};
use litesvm::LiteSVM;
use reputation::state::{AgentProfile, AgentServiceLink, ServiceCategory, ServiceRegistry};
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

fn derive_receipt_pda(receipt_hash: &[u8; 32]) -> Pubkey {
    Pubkey::find_program_address(&[b"receipt", receipt_hash.as_ref()], &reputation::ID).0
}

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
                category: ServiceCategory::DataFeed,
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

    Fixture {
        svm,
        service,
        agent_profile,
        service_registry,
    }
}

fn build_record_ix(
    service: &Pubkey,
    agent_profile: &Pubkey,
    service_registry: &Pubkey,
    agent_service_link: &Pubkey,
    receipt_used: &Pubkey,
    amount_usdc: u64,
    payment_receipt_hash: [u8; 32],
) -> Instruction {
    let accounts = reputation::accounts::RecordPayment {
        service: *service,
        agent_profile: *agent_profile,
        service_registry: *service_registry,
        agent_service_link: *agent_service_link,
        receipt_used: *receipt_used,
        system_program: System::id(),
    };
    let args = reputation::instruction::RecordPayment {
        amount_usdc,
        payment_receipt_hash,
    };
    Instruction {
        program_id: reputation::ID,
        accounts: accounts.to_account_metas(None),
        data: args.data(),
    }
}

#[test]
fn record_payment_happy_path() {
    let Fixture {
        mut svm,
        service,
        agent_profile,
        service_registry,
    } = setup();
    let link_pda = derive_link_pda(&agent_profile, &service_registry);
    let receipt = [7u8; 32];
    let receipt_pda = derive_receipt_pda(&receipt);

    let ix = build_record_ix(
        &service.pubkey(),
        &agent_profile,
        &service_registry,
        &link_pda,
        &receipt_pda,
        1_000_000,
        receipt,
    );
    let blockhash = svm.latest_blockhash();
    let tx =
        Transaction::new_signed_with_payer(&[ix], Some(&service.pubkey()), &[&service], blockhash);
    svm.send_transaction(tx).expect("record_payment failed");

    let profile_acct = svm.get_account(&agent_profile).unwrap();
    let profile = AgentProfile::try_deserialize(&mut profile_acct.data.as_slice()).unwrap();
    assert_eq!(profile.total_transactions, 1);
    assert_eq!(profile.total_volume_usdc, 1_000_000);
    assert_eq!(profile.consecutive_success, 1);
    assert_eq!(profile.services_used, 1);

    let registry_acct = svm.get_account(&service_registry).unwrap();
    let registry = ServiceRegistry::try_deserialize(&mut registry_acct.data.as_slice()).unwrap();
    assert_eq!(registry.total_agents_served, 1);
    assert_eq!(registry.total_volume_received_usdc, 1_000_000);

    let link_acct = svm.get_account(&link_pda).unwrap();
    let link = AgentServiceLink::try_deserialize(&mut link_acct.data.as_slice()).unwrap();
    assert_eq!(link.agent, agent_profile);
    assert_eq!(link.service, service_registry);
    assert_eq!(link.total_transactions, 1);
    assert_eq!(link.total_volume_usdc, 1_000_000);
    assert_eq!(link.first_payment_slot, link.last_payment_slot);
    assert_eq!(link_acct.data.len(), AgentServiceLink::ACCOUNT_SIZE);

    let receipt_acct = svm
        .get_account(&receipt_pda)
        .expect("receipt PDA must exist after first record");
    assert_eq!(receipt_acct.owner, reputation::ID);
}

#[test]
fn record_payment_rejects_replay_of_same_receipt_hash() {
    let Fixture {
        mut svm,
        service,
        agent_profile,
        service_registry,
    } = setup();
    let link_pda = derive_link_pda(&agent_profile, &service_registry);
    let receipt = [9u8; 32];
    let receipt_pda = derive_receipt_pda(&receipt);

    let ix1 = build_record_ix(
        &service.pubkey(),
        &agent_profile,
        &service_registry,
        &link_pda,
        &receipt_pda,
        500_000,
        receipt,
    );
    let blockhash = svm.latest_blockhash();
    let tx1 = Transaction::new_signed_with_payer(
        std::slice::from_ref(&ix1),
        Some(&service.pubkey()),
        &[&service],
        blockhash,
    );
    svm.send_transaction(tx1)
        .expect("first record must succeed");

    svm.expire_blockhash();
    let ix2 = build_record_ix(
        &service.pubkey(),
        &agent_profile,
        &service_registry,
        &link_pda,
        &receipt_pda,
        500_000,
        receipt,
    );
    let blockhash = svm.latest_blockhash();
    let tx2 =
        Transaction::new_signed_with_payer(&[ix2], Some(&service.pubkey()), &[&service], blockhash);
    let result = svm.send_transaction(tx2);
    assert!(
        result.is_err(),
        "replay of the same receipt hash must be rejected"
    );

    // And the agent's counters must reflect only ONE payment.
    let profile = AgentProfile::try_deserialize(
        &mut svm.get_account(&agent_profile).unwrap().data.as_slice(),
    )
    .unwrap();
    assert_eq!(profile.total_transactions, 1);
    assert_eq!(profile.total_volume_usdc, 500_000);
}

#[test]
fn record_payment_second_payment_same_pair_does_not_increment_services_used() {
    let Fixture {
        mut svm,
        service,
        agent_profile,
        service_registry,
    } = setup();
    let link_pda = derive_link_pda(&agent_profile, &service_registry);

    // Distinct receipts per call — same-receipt replay is a separate test.
    let receipts: [[u8; 32]; 2] = [[1u8; 32], [2u8; 32]];

    for receipt in receipts {
        let receipt_pda = derive_receipt_pda(&receipt);
        let ix = build_record_ix(
            &service.pubkey(),
            &agent_profile,
            &service_registry,
            &link_pda,
            &receipt_pda,
            500_000,
            receipt,
        );
        let blockhash = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&service.pubkey()),
            &[&service],
            blockhash,
        );
        svm.send_transaction(tx).expect("record_payment failed");
        svm.expire_blockhash();
    }

    let profile = AgentProfile::try_deserialize(
        &mut svm.get_account(&agent_profile).unwrap().data.as_slice(),
    )
    .unwrap();
    assert_eq!(profile.total_transactions, 2);
    assert_eq!(profile.total_volume_usdc, 1_000_000);
    assert_eq!(profile.consecutive_success, 2);
    assert_eq!(
        profile.services_used, 1,
        "services_used must only increment on new pair"
    );

    let registry = ServiceRegistry::try_deserialize(
        &mut svm.get_account(&service_registry).unwrap().data.as_slice(),
    )
    .unwrap();
    assert_eq!(
        registry.total_agents_served, 1,
        "total_agents_served must only increment on new pair"
    );
    assert_eq!(registry.total_volume_received_usdc, 1_000_000);
}

#[test]
fn record_payment_rejects_zero_amount() {
    let Fixture {
        mut svm,
        service,
        agent_profile,
        service_registry,
    } = setup();
    let link_pda = derive_link_pda(&agent_profile, &service_registry);
    let receipt = [3u8; 32];
    let receipt_pda = derive_receipt_pda(&receipt);

    let ix = build_record_ix(
        &service.pubkey(),
        &agent_profile,
        &service_registry,
        &link_pda,
        &receipt_pda,
        0,
        receipt,
    );
    let blockhash = svm.latest_blockhash();
    let tx =
        Transaction::new_signed_with_payer(&[ix], Some(&service.pubkey()), &[&service], blockhash);
    let result = svm.send_transaction(tx);
    assert!(result.is_err(), "zero amount must be rejected");
}

#[test]
fn record_payment_rejects_missing_service_signature() {
    let Fixture {
        mut svm,
        service,
        agent_profile,
        service_registry,
    } = setup();
    let link_pda = derive_link_pda(&agent_profile, &service_registry);
    let receipt = [4u8; 32];
    let receipt_pda = derive_receipt_pda(&receipt);

    let other_payer = Keypair::new();
    svm.airdrop(&other_payer.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();

    let mut metas = reputation::accounts::RecordPayment {
        service: service.pubkey(),
        agent_profile,
        service_registry,
        agent_service_link: link_pda,
        receipt_used: receipt_pda,
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
        data: reputation::instruction::RecordPayment {
            amount_usdc: 1_000,
            payment_receipt_hash: receipt,
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

#[test]
fn record_payment_rejects_wrong_service_signer() {
    let Fixture {
        mut svm,
        service: _,
        agent_profile,
        service_registry,
    } = setup();

    let attacker = Keypair::new();
    svm.airdrop(&attacker.pubkey(), 5 * LAMPORTS_PER_SOL)
        .unwrap();

    let link_pda = derive_link_pda(&agent_profile, &service_registry);
    let receipt = [5u8; 32];
    let receipt_pda = derive_receipt_pda(&receipt);

    let ix = build_record_ix(
        &attacker.pubkey(),
        &agent_profile,
        &service_registry,
        &link_pda,
        &receipt_pda,
        1_000,
        receipt,
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
        "attacker signing for someone else's registry must fail"
    );
}

#[test]
fn record_payment_distinct_services_each_bump_services_used() {
    let Fixture {
        mut svm,
        service: service_a,
        agent_profile,
        service_registry: registry_a,
    } = setup();

    let service_b = Keypair::new();
    svm.airdrop(&service_b.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();
    let registry_b = derive_service_pda(&service_b.pubkey());
    {
        let accounts = reputation::accounts::RegisterService {
            sponsor: service_b.pubkey(),
            service: service_b.pubkey(),
            service_registry: registry_b,
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
            Some(&service_b.pubkey()),
            &[&service_b],
            blockhash,
        );
        svm.send_transaction(tx).expect("register B failed");
    }

    let link_a = derive_link_pda(&agent_profile, &registry_a);
    let link_b = derive_link_pda(&agent_profile, &registry_b);
    assert_ne!(link_a, link_b);

    let receipt_a = [0xaau8; 32];
    let receipt_b = [0xbbu8; 32];

    {
        let ix = build_record_ix(
            &service_a.pubkey(),
            &agent_profile,
            &registry_a,
            &link_a,
            &derive_receipt_pda(&receipt_a),
            100_000,
            receipt_a,
        );
        let blockhash = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&service_a.pubkey()),
            &[&service_a],
            blockhash,
        );
        svm.send_transaction(tx).expect("pay A failed");
    }

    {
        let ix = build_record_ix(
            &service_b.pubkey(),
            &agent_profile,
            &registry_b,
            &link_b,
            &derive_receipt_pda(&receipt_b),
            250_000,
            receipt_b,
        );
        let blockhash = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&service_b.pubkey()),
            &[&service_b],
            blockhash,
        );
        svm.send_transaction(tx).expect("pay B failed");
    }

    let profile = AgentProfile::try_deserialize(
        &mut svm.get_account(&agent_profile).unwrap().data.as_slice(),
    )
    .unwrap();
    assert_eq!(profile.total_transactions, 2);
    assert_eq!(profile.total_volume_usdc, 350_000);
    assert_eq!(profile.services_used, 2);
}

#[test]
fn record_payment_rejects_cross_pair_receipt_collision() {
    // Two different (agent, service) pairs can NOT share a receipt hash:
    // receipt uniqueness is global, by design.
    let Fixture {
        mut svm,
        service: service_a,
        agent_profile,
        service_registry: registry_a,
    } = setup();

    let service_b = Keypair::new();
    svm.airdrop(&service_b.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();
    let registry_b = derive_service_pda(&service_b.pubkey());
    {
        let accounts = reputation::accounts::RegisterService {
            sponsor: service_b.pubkey(),
            service: service_b.pubkey(),
            service_registry: registry_b,
            system_program: System::id(),
        };
        let ix = Instruction {
            program_id: reputation::ID,
            accounts: accounts.to_account_metas(None),
            data: reputation::instruction::RegisterService {
                name: [0u8; 32],
                category: ServiceCategory::Other,
                service_uri: [0u8; 128],
            }
            .data(),
        };
        let blockhash = svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&service_b.pubkey()),
            &[&service_b],
            blockhash,
        );
        svm.send_transaction(tx).expect("register B failed");
    }

    let link_a = derive_link_pda(&agent_profile, &registry_a);
    let link_b = derive_link_pda(&agent_profile, &registry_b);
    let shared_receipt = [0xcdu8; 32];
    let shared_receipt_pda = derive_receipt_pda(&shared_receipt);

    let ix_a = build_record_ix(
        &service_a.pubkey(),
        &agent_profile,
        &registry_a,
        &link_a,
        &shared_receipt_pda,
        100_000,
        shared_receipt,
    );
    let blockhash = svm.latest_blockhash();
    let tx_a = Transaction::new_signed_with_payer(
        &[ix_a],
        Some(&service_a.pubkey()),
        &[&service_a],
        blockhash,
    );
    svm.send_transaction(tx_a)
        .expect("first record must succeed");

    svm.expire_blockhash();
    let ix_b = build_record_ix(
        &service_b.pubkey(),
        &agent_profile,
        &registry_b,
        &link_b,
        &shared_receipt_pda,
        100_000,
        shared_receipt,
    );
    let blockhash = svm.latest_blockhash();
    let tx_b = Transaction::new_signed_with_payer(
        &[ix_b],
        Some(&service_b.pubkey()),
        &[&service_b],
        blockhash,
    );
    let result = svm.send_transaction(tx_b);
    assert!(
        result.is_err(),
        "second use of same receipt hash (different pair) must fail"
    );
}
