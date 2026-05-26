// LiteSVM tests for `freeze_vault` / `unfreeze_vault` (slice 2.9).

#![allow(deprecated)]

mod common;
use anchor_lang::AccountDeserialize;
use anchor_lang::{InstructionData, ToAccountMetas};
use common::*;
use credit_vault::state::CreditVault;
use solana_sdk::{
    instruction::Instruction,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
};

fn freeze_ix(owner: &Pubkey, vault: &Pubkey) -> Instruction {
    let accounts = credit_vault::accounts::FreezeVault {
        owner: *owner,
        vault: *vault,
    };
    Instruction {
        program_id: credit_vault::ID,
        accounts: accounts.to_account_metas(None),
        data: credit_vault::instruction::FreezeVault {}.data(),
    }
}

fn unfreeze_ix(owner: &Pubkey, vault: &Pubkey) -> Instruction {
    let accounts = credit_vault::accounts::FreezeVault {
        owner: *owner,
        vault: *vault,
    };
    Instruction {
        program_id: credit_vault::ID,
        accounts: accounts.to_account_metas(None),
        data: credit_vault::instruction::UnfreezeVault {}.data(),
    }
}

fn read_frozen(svm: &litesvm::LiteSVM, vault: &Pubkey) -> bool {
    let acct = svm.get_account(vault).unwrap();
    CreditVault::try_deserialize(&mut acct.data.as_slice())
        .unwrap()
        .frozen
}

#[test]
fn freeze_then_unfreeze_round_trip() {
    let mut w = build_world(WorldOpts::default());
    assert!(!read_frozen(&w.svm, &w.vault));

    let blockhash = w.svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(
        &[freeze_ix(&w.owner.pubkey(), &w.vault)],
        Some(&w.owner.pubkey()),
        &[&w.owner],
        blockhash,
    );
    w.svm.send_transaction(tx).expect("freeze failed");
    assert!(read_frozen(&w.svm, &w.vault));

    w.svm.expire_blockhash();
    let blockhash = w.svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(
        &[unfreeze_ix(&w.owner.pubkey(), &w.vault)],
        Some(&w.owner.pubkey()),
        &[&w.owner],
        blockhash,
    );
    w.svm.send_transaction(tx).expect("unfreeze failed");
    assert!(!read_frozen(&w.svm, &w.vault));
}

#[test]
fn freeze_idempotency_is_rejected() {
    let mut w = build_world(WorldOpts::default());

    let blockhash = w.svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(
        &[freeze_ix(&w.owner.pubkey(), &w.vault)],
        Some(&w.owner.pubkey()),
        &[&w.owner],
        blockhash,
    );
    w.svm.send_transaction(tx).expect("first freeze ok");
    w.svm.expire_blockhash();

    let blockhash = w.svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(
        &[freeze_ix(&w.owner.pubkey(), &w.vault)],
        Some(&w.owner.pubkey()),
        &[&w.owner],
        blockhash,
    );
    let result = w.svm.send_transaction(tx);
    assert!(result.is_err(), "double-freeze must reject");
}

#[test]
fn unfreeze_on_unfrozen_vault_is_rejected() {
    let mut w = build_world(WorldOpts::default());

    let blockhash = w.svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(
        &[unfreeze_ix(&w.owner.pubkey(), &w.vault)],
        Some(&w.owner.pubkey()),
        &[&w.owner],
        blockhash,
    );
    let result = w.svm.send_transaction(tx);
    assert!(result.is_err(), "unfreeze on unfrozen vault must reject");
}

#[test]
fn freeze_rejected_for_non_owner() {
    let mut w = build_world(WorldOpts::default());

    let attacker = Keypair::new();
    w.svm.airdrop(&attacker.pubkey(), 2_000_000_000).unwrap();

    let blockhash = w.svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(
        &[freeze_ix(&attacker.pubkey(), &w.vault)],
        Some(&attacker.pubkey()),
        &[&attacker],
        blockhash,
    );
    let result = w.svm.send_transaction(tx);
    assert!(result.is_err(), "non-owner cannot freeze");
}
