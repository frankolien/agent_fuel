// LiteSVM integration tests for `register_service`.

use anchor_lang::prelude::System;
use anchor_lang::{AccountDeserialize, Id, InstructionData, ToAccountMetas};
use litesvm::LiteSVM;
use reputation::state::{ServiceCategory, ServiceRegistry};
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

fn setup() -> (LiteSVM, Keypair) {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(reputation::ID, REPUTATION_SO)
        .expect("reputation.so missing — run `anchor build` first");

    let service = Keypair::new();
    svm.airdrop(&service.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();
    (svm, service)
}

fn derive_service_pda(service: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"service", service.as_ref()], &reputation::ID).0
}

fn build_register_ix(
    service: &Pubkey,
    service_registry: &Pubkey,
    name: [u8; 32],
    category: ServiceCategory,
) -> Instruction {
    let accounts = reputation::accounts::RegisterService {
        service: *service,
        service_registry: *service_registry,
        system_program: System::id(),
    };
    let args = reputation::instruction::RegisterService { name, category };
    Instruction {
        program_id: reputation::ID,
        accounts: accounts.to_account_metas(None),
        data: args.data(),
    }
}

#[test]
fn register_service_happy_path() {
    let (mut svm, service) = setup();
    let service_pda = derive_service_pda(&service.pubkey());

    let mut name = [0u8; 32];
    let label = b"Acme Price Feed";
    name[..label.len()].copy_from_slice(label);

    let ix = build_register_ix(
        &service.pubkey(),
        &service_pda,
        name,
        ServiceCategory::DataFeed,
    );
    let blockhash = svm.latest_blockhash();
    let tx =
        Transaction::new_signed_with_payer(&[ix], Some(&service.pubkey()), &[&service], blockhash);
    svm.send_transaction(tx).expect("register failed");

    let account = svm.get_account(&service_pda).expect("registry missing");
    let registry = ServiceRegistry::try_deserialize(&mut account.data.as_slice()).unwrap();

    assert_eq!(registry.authority, service.pubkey());
    assert_eq!(registry.name, name);
    assert_eq!(registry.category, ServiceCategory::DataFeed);
    assert!(registry.active);
    assert_eq!(registry.total_agents_served, 0);
    assert_eq!(registry.total_volume_received_usdc, 0);
    assert_eq!(registry.first_active_slot, registry.last_active_slot);
    assert_eq!(account.data.len(), ServiceRegistry::ACCOUNT_SIZE);
}

#[test]
fn register_service_rejects_re_register() {
    let (mut svm, service) = setup();
    let service_pda = derive_service_pda(&service.pubkey());

    let ix = build_register_ix(
        &service.pubkey(),
        &service_pda,
        [0u8; 32],
        ServiceCategory::Other,
    );
    let blockhash = svm.latest_blockhash();
    let tx1 = Transaction::new_signed_with_payer(
        std::slice::from_ref(&ix),
        Some(&service.pubkey()),
        &[&service],
        blockhash,
    );
    svm.send_transaction(tx1)
        .expect("first register must succeed");

    let blockhash = svm.latest_blockhash();
    let tx2 =
        Transaction::new_signed_with_payer(&[ix], Some(&service.pubkey()), &[&service], blockhash);
    let result = svm.send_transaction(tx2);
    assert!(result.is_err(), "re-register must fail");
}

#[test]
fn register_service_rejects_missing_signature() {
    let (mut svm, service) = setup();
    let service_pda = derive_service_pda(&service.pubkey());

    let mut metas = reputation::accounts::RegisterService {
        service: service.pubkey(),
        service_registry: service_pda,
        system_program: System::id(),
    }
    .to_account_metas(None);
    for meta in metas.iter_mut() {
        if meta.pubkey == service.pubkey() {
            meta.is_signer = false;
        }
    }

    let other_payer = Keypair::new();
    svm.airdrop(&other_payer.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();

    let ix = Instruction {
        program_id: reputation::ID,
        accounts: metas,
        data: reputation::instruction::RegisterService {
            name: [0u8; 32],
            category: ServiceCategory::Other,
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
fn register_service_distinct_pubkeys_get_distinct_pdas() {
    let (mut svm, service_a) = setup();
    let service_b = Keypair::new();
    svm.airdrop(&service_b.pubkey(), 10 * LAMPORTS_PER_SOL)
        .unwrap();

    let pda_a = derive_service_pda(&service_a.pubkey());
    let pda_b = derive_service_pda(&service_b.pubkey());
    assert_ne!(pda_a, pda_b);

    let ix_a = build_register_ix(
        &service_a.pubkey(),
        &pda_a,
        [0u8; 32],
        ServiceCategory::Compute,
    );
    let ix_b = build_register_ix(
        &service_b.pubkey(),
        &pda_b,
        [0u8; 32],
        ServiceCategory::Swap,
    );

    let blockhash = svm.latest_blockhash();
    let tx_a = Transaction::new_signed_with_payer(
        &[ix_a],
        Some(&service_a.pubkey()),
        &[&service_a],
        blockhash,
    );
    svm.send_transaction(tx_a)
        .expect("service A register failed");

    let blockhash = svm.latest_blockhash();
    let tx_b = Transaction::new_signed_with_payer(
        &[ix_b],
        Some(&service_b.pubkey()),
        &[&service_b],
        blockhash,
    );
    svm.send_transaction(tx_b)
        .expect("service B register failed");

    let reg_a =
        ServiceRegistry::try_deserialize(&mut svm.get_account(&pda_a).unwrap().data.as_slice())
            .unwrap();
    let reg_b =
        ServiceRegistry::try_deserialize(&mut svm.get_account(&pda_b).unwrap().data.as_slice())
            .unwrap();
    assert_eq!(reg_a.category, ServiceCategory::Compute);
    assert_eq!(reg_b.category, ServiceCategory::Swap);
}
