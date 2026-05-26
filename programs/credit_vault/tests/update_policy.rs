// LiteSVM tests for `update_policy` (slice 2.10).

#![allow(deprecated)]

mod common;
use anchor_lang::AccountDeserialize;
use anchor_lang::{InstructionData, ToAccountMetas};
use common::*;
use credit_vault::state::{SpendPolicy, WHITELIST_LEN};
use solana_sdk::{
    instruction::Instruction,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
};

#[allow(clippy::too_many_arguments)]
fn update_ix(
    owner: &Pubkey,
    vault: &Pubkey,
    policy: &Pubkey,
    per_tx: u64,
    hourly: u64,
    lifetime: u64,
    allow_post_pay: bool,
    whitelist: [Pubkey; WHITELIST_LEN],
) -> Instruction {
    let accounts = credit_vault::accounts::UpdatePolicy {
        owner: *owner,
        vault: *vault,
        policy: *policy,
    };
    Instruction {
        program_id: credit_vault::ID,
        accounts: accounts.to_account_metas(None),
        data: credit_vault::instruction::UpdatePolicy {
            new_per_tx_limit_usdc: per_tx,
            new_hourly_limit_usdc: hourly,
            new_lifetime_limit_usdc: lifetime,
            new_allow_post_pay: allow_post_pay,
            new_whitelist: whitelist,
        }
        .data(),
    }
}

#[test]
fn update_policy_rewrites_all_fields_and_keeps_window_intact() {
    let mut w = build_world(WorldOpts {
        per_tx_limit_usdc: 1_000_000,
        hourly_limit_usdc: 5_000_000,
        lifetime_limit_usdc: 50_000_000,
        ..Default::default()
    });

    let mut whitelist = [Pubkey::default(); WHITELIST_LEN];
    whitelist[0] = Pubkey::new_unique();
    whitelist[1] = w.service.pubkey();

    let ix = update_ix(
        &w.owner.pubkey(),
        &w.vault,
        &w.policy,
        2_000_000,
        20_000_000,
        200_000_000,
        true,
        whitelist,
    );
    let blockhash = w.svm.latest_blockhash();
    let tx =
        Transaction::new_signed_with_payer(&[ix], Some(&w.owner.pubkey()), &[&w.owner], blockhash);
    w.svm.send_transaction(tx).expect("update_policy failed");

    let policy =
        SpendPolicy::try_deserialize(&mut w.svm.get_account(&w.policy).unwrap().data.as_slice())
            .unwrap();
    assert_eq!(policy.per_tx_limit_usdc, 2_000_000);
    assert_eq!(policy.hourly_limit_usdc, 20_000_000);
    assert_eq!(policy.lifetime_limit_usdc, 200_000_000);
    assert!(policy.allow_post_pay);
    assert_eq!(policy.whitelist, whitelist);
    // Window counters NOT touched by update_policy (still zero — no spends yet).
    assert_eq!(policy.hourly_window_start_slot, 0);
    assert_eq!(policy.hourly_window_spent_usdc, 0);
}

#[test]
fn update_policy_rejected_for_non_owner() {
    let mut w = build_world(WorldOpts::default());

    let attacker = Keypair::new();
    w.svm.airdrop(&attacker.pubkey(), 2_000_000_000).unwrap();

    let ix = update_ix(
        &attacker.pubkey(),
        &w.vault,
        &w.policy,
        999,
        999,
        999,
        true,
        [Pubkey::default(); WHITELIST_LEN],
    );
    let blockhash = w.svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&attacker.pubkey()),
        &[&attacker],
        blockhash,
    );
    let result = w.svm.send_transaction(tx);
    assert!(result.is_err(), "non-owner cannot update policy");
}
