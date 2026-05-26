// LiteSVM tests for `withdraw` (slice 2.11).

#![allow(deprecated)]

mod common;
use anchor_lang::AccountDeserialize;
use anchor_lang::Id;
use anchor_lang::{InstructionData, ToAccountMetas};
use anchor_spl::token::Token;
use common::*;
use credit_vault::state::CreditVault;
use solana_sdk::{
    instruction::Instruction,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
};

fn withdraw_ix(
    owner: &Pubkey,
    vault: &Pubkey,
    vault_ata: &Pubkey,
    owner_ata: &Pubkey,
    amount: u64,
) -> Instruction {
    let accounts = credit_vault::accounts::Withdraw {
        owner: *owner,
        vault: *vault,
        vault_token_account: *vault_ata,
        owner_token_account: *owner_ata,
        token_program: Token::id(),
    };
    Instruction {
        program_id: credit_vault::ID,
        accounts: accounts.to_account_metas(None),
        data: credit_vault::instruction::Withdraw {
            amount_usdc: amount,
        }
        .data(),
    }
}

#[test]
fn withdraw_happy_path_pda_signs_transfer_back_to_owner() {
    let mut w = build_world(WorldOpts::default());
    let owner_ata = derive_ata(&w.owner.pubkey(), &w.mint);

    assert_eq!(read_ata_balance(&w.svm, &w.vault_ata), 100_000_000);
    let owner_before = read_ata_balance(&w.svm, &owner_ata);

    let ix = withdraw_ix(
        &w.owner.pubkey(),
        &w.vault,
        &w.vault_ata,
        &owner_ata,
        30_000_000,
    );
    let blockhash = w.svm.latest_blockhash();
    let tx =
        Transaction::new_signed_with_payer(&[ix], Some(&w.owner.pubkey()), &[&w.owner], blockhash);
    w.svm.send_transaction(tx).expect("withdraw failed");

    assert_eq!(read_ata_balance(&w.svm, &w.vault_ata), 70_000_000);
    assert_eq!(
        read_ata_balance(&w.svm, &owner_ata),
        owner_before + 30_000_000
    );

    let vault =
        CreditVault::try_deserialize(&mut w.svm.get_account(&w.vault).unwrap().data.as_slice())
            .unwrap();
    assert_eq!(vault.total_withdrawn, 30_000_000);
}

#[test]
fn withdraw_works_even_when_vault_is_frozen() {
    let mut w = build_world(WorldOpts::default());
    let owner_ata = derive_ata(&w.owner.pubkey(), &w.mint);

    // freeze
    {
        let accounts = credit_vault::accounts::FreezeVault {
            owner: w.owner.pubkey(),
            vault: w.vault,
        };
        let ix = Instruction {
            program_id: credit_vault::ID,
            accounts: accounts.to_account_metas(None),
            data: credit_vault::instruction::FreezeVault {}.data(),
        };
        let blockhash = w.svm.latest_blockhash();
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&w.owner.pubkey()),
            &[&w.owner],
            blockhash,
        );
        w.svm.send_transaction(tx).expect("freeze failed");
        w.svm.expire_blockhash();
    }

    let ix = withdraw_ix(
        &w.owner.pubkey(),
        &w.vault,
        &w.vault_ata,
        &owner_ata,
        5_000_000,
    );
    let blockhash = w.svm.latest_blockhash();
    let tx =
        Transaction::new_signed_with_payer(&[ix], Some(&w.owner.pubkey()), &[&w.owner], blockhash);
    w.svm
        .send_transaction(tx)
        .expect("frozen vault must still allow withdraw");
}

#[test]
fn withdraw_rejects_zero_amount() {
    let mut w = build_world(WorldOpts::default());
    let owner_ata = derive_ata(&w.owner.pubkey(), &w.mint);

    let ix = withdraw_ix(&w.owner.pubkey(), &w.vault, &w.vault_ata, &owner_ata, 0);
    let blockhash = w.svm.latest_blockhash();
    let tx =
        Transaction::new_signed_with_payer(&[ix], Some(&w.owner.pubkey()), &[&w.owner], blockhash);
    let result = w.svm.send_transaction(tx);
    assert!(result.is_err(), "zero withdraw must reject");
}

#[test]
fn withdraw_rejects_non_owner_signer() {
    let mut w = build_world(WorldOpts::default());

    let attacker = Keypair::new();
    w.svm.airdrop(&attacker.pubkey(), 2_000_000_000).unwrap();
    let attacker_ata = create_and_fund_ata(&mut w.svm, &attacker, &w.mint, &w.mint_authority, 0);

    let ix = withdraw_ix(
        &attacker.pubkey(),
        &w.vault,
        &w.vault_ata,
        &attacker_ata,
        1_000_000,
    );
    let blockhash = w.svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&attacker.pubkey()),
        &[&attacker],
        blockhash,
    );
    let result = w.svm.send_transaction(tx);
    assert!(result.is_err(), "non-owner cannot withdraw");
}

#[test]
fn withdraw_rejects_wrong_vault_token_account() {
    let mut w = build_world(WorldOpts::default());
    let owner_ata = derive_ata(&w.owner.pubkey(), &w.mint);

    let attacker = Keypair::new();
    w.svm.airdrop(&attacker.pubkey(), 2_000_000_000).unwrap();
    let attacker_ata = create_and_fund_ata(&mut w.svm, &attacker, &w.mint, &w.mint_authority, 0);

    // Owner tries to use a foreign token account as the vault source.
    let ix = withdraw_ix(
        &w.owner.pubkey(),
        &w.vault,
        &attacker_ata,
        &owner_ata,
        1_000_000,
    );
    let blockhash = w.svm.latest_blockhash();
    let tx =
        Transaction::new_signed_with_payer(&[ix], Some(&w.owner.pubkey()), &[&w.owner], blockhash);
    let result = w.svm.send_transaction(tx);
    assert!(
        result.is_err(),
        "substituted vault_token_account must be rejected"
    );
}
