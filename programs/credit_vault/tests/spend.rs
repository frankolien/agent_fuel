// LiteSVM tests for `spend` covering all six policy check branches
// (slices 2.3 - 2.8).

#![allow(deprecated)]

mod common;
use anchor_lang::AccountDeserialize;
use anchor_lang::{InstructionData, ToAccountMetas};
use common::*;
use credit_vault::state::{CreditVault, SpendPolicy, SLOTS_PER_HOUR, WHITELIST_LEN};
use solana_sdk::{
    instruction::Instruction,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
};

// Returns Result<(), ()> rather than the full FailedTransactionMetadata to
// keep clippy::result-large-err happy. Callers only check is_err().
fn send_spend(w: &mut VaultWorld, amount: u64) -> Result<(), ()> {
    let ix = build_spend_ix(
        &w.agent.pubkey(),
        &w.vault,
        &w.policy,
        &w.vault_ata,
        &w.service_ata,
        amount,
    );
    let blockhash = w.svm.latest_blockhash();
    let tx =
        Transaction::new_signed_with_payer(&[ix], Some(&w.agent.pubkey()), &[&w.agent], blockhash);
    w.svm.send_transaction(tx).map_err(|_| ())?;
    w.svm.expire_blockhash();
    Ok(())
}

// ---- Slice 2.3: happy path ---------------------------------------------------

#[test]
fn spend_happy_path_pda_signs_cpi_transfer() {
    let mut w = build_world(WorldOpts::default());

    send_spend(&mut w, 5_000_000).expect("spend failed");

    assert_eq!(read_ata_balance(&w.svm, &w.service_ata), 5_000_000);
    assert_eq!(read_ata_balance(&w.svm, &w.vault_ata), 95_000_000);

    let vault =
        CreditVault::try_deserialize(&mut w.svm.get_account(&w.vault).unwrap().data.as_slice())
            .unwrap();
    assert_eq!(vault.total_spent, 5_000_000);
}

// ---- Slice 2.4: frozen check -------------------------------------------------

#[test]
fn spend_rejected_when_vault_frozen() {
    let mut w = build_world(WorldOpts::default());

    // freeze
    let accounts = credit_vault::accounts::FreezeVault {
        owner: w.owner.pubkey(),
        vault: w.vault,
    };
    let freeze_ix = Instruction {
        program_id: credit_vault::ID,
        accounts: accounts.to_account_metas(None),
        data: credit_vault::instruction::FreezeVault {}.data(),
    };
    let blockhash = w.svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(
        &[freeze_ix],
        Some(&w.owner.pubkey()),
        &[&w.owner],
        blockhash,
    );
    w.svm.send_transaction(tx).expect("freeze failed");
    w.svm.expire_blockhash();

    let result = send_spend(&mut w, 1_000_000);
    assert!(result.is_err(), "spend on frozen vault must fail");
    assert_eq!(read_ata_balance(&w.svm, &w.service_ata), 0);
}

// ---- Slice 2.3 / 2.6: zero amount + per-tx limit -----------------------------

#[test]
fn spend_rejects_zero_amount() {
    let mut w = build_world(WorldOpts::default());
    let result = send_spend(&mut w, 0);
    assert!(result.is_err());
}

#[test]
fn spend_rejects_amount_above_per_tx_limit() {
    let mut w = build_world(WorldOpts {
        per_tx_limit_usdc: 2_000_000,
        ..Default::default()
    });
    // 2.5 USDC > 2.0 USDC per-tx limit.
    let result = send_spend(&mut w, 2_500_000);
    assert!(result.is_err(), "above per-tx limit must reject");
    assert_eq!(read_ata_balance(&w.svm, &w.service_ata), 0);

    // exactly at the limit must succeed.
    send_spend(&mut w, 2_000_000).expect("at limit must succeed");
    assert_eq!(read_ata_balance(&w.svm, &w.service_ata), 2_000_000);
}

// ---- Slice 2.5: whitelist ----------------------------------------------------

#[test]
fn spend_rejected_when_recipient_not_whitelisted() {
    let mut w = build_world(WorldOpts::default());

    // Set a whitelist that does NOT include our service.
    let stranger = Keypair::new();
    let mut whitelist = [Pubkey::default(); WHITELIST_LEN];
    whitelist[0] = stranger.pubkey();
    update_policy_via_owner(&mut w, 0, 0, 0, false, whitelist);

    let result = send_spend(&mut w, 1_000_000);
    assert!(result.is_err(), "recipient not in whitelist must reject");
}

#[test]
fn spend_allowed_when_recipient_is_whitelisted() {
    let mut w = build_world(WorldOpts::default());

    let mut whitelist = [Pubkey::default(); WHITELIST_LEN];
    whitelist[2] = w.service.pubkey();
    whitelist[5] = Pubkey::new_unique();
    update_policy_via_owner(&mut w, 0, 0, 0, false, whitelist);

    send_spend(&mut w, 1_500_000).expect("whitelisted recipient must succeed");
    assert_eq!(read_ata_balance(&w.svm, &w.service_ata), 1_500_000);
}

// ---- Slice 2.7: hourly rolling window ---------------------------------------

#[test]
fn spend_rejected_when_hourly_window_exceeded() {
    let mut w = build_world(WorldOpts {
        hourly_limit_usdc: 10_000_000, // 10 USDC / hour
        ..Default::default()
    });

    send_spend(&mut w, 6_000_000).expect("first spend ok");
    // Second spend would bring window total to 11 USDC > 10 USDC limit.
    let result = send_spend(&mut w, 5_000_000);
    assert!(result.is_err(), "hourly limit must reject");

    let policy =
        SpendPolicy::try_deserialize(&mut w.svm.get_account(&w.policy).unwrap().data.as_slice())
            .unwrap();
    assert_eq!(policy.hourly_window_spent_usdc, 6_000_000);
}

#[test]
fn spend_hourly_window_resets_after_an_hour() {
    let mut w = build_world(WorldOpts {
        hourly_limit_usdc: 10_000_000,
        ..Default::default()
    });

    send_spend(&mut w, 8_000_000).expect("first spend ok");
    // Warp past one hour — window resets.
    w.svm.warp_to_slot(SLOTS_PER_HOUR + 10);
    w.svm.expire_blockhash();
    send_spend(&mut w, 7_000_000).expect("post-window spend must succeed");

    let policy =
        SpendPolicy::try_deserialize(&mut w.svm.get_account(&w.policy).unwrap().data.as_slice())
            .unwrap();
    assert_eq!(policy.hourly_window_spent_usdc, 7_000_000);
    assert!(policy.hourly_window_start_slot >= SLOTS_PER_HOUR);
}

// ---- Slice 2.8: lifetime ceiling --------------------------------------------

#[test]
fn spend_rejected_when_lifetime_ceiling_exceeded() {
    let mut w = build_world(WorldOpts {
        lifetime_limit_usdc: 10_000_000,
        ..Default::default()
    });

    send_spend(&mut w, 7_000_000).expect("first spend ok");
    let result = send_spend(&mut w, 4_000_000);
    assert!(result.is_err(), "lifetime ceiling must reject");

    let vault =
        CreditVault::try_deserialize(&mut w.svm.get_account(&w.vault).unwrap().data.as_slice())
            .unwrap();
    assert_eq!(vault.total_spent, 7_000_000);
}

// ---- Common: non-agent signer ------------------------------------------------

#[test]
fn spend_rejects_non_agent_signer() {
    let mut w = build_world(WorldOpts::default());

    let attacker = Keypair::new();
    w.svm
        .airdrop(&attacker.pubkey(), 5 * 1_000_000_000)
        .unwrap();

    let ix = build_spend_ix(
        &attacker.pubkey(),
        &w.vault,
        &w.policy,
        &w.vault_ata,
        &w.service_ata,
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
    assert!(result.is_err(), "non-agent signer must be rejected");
}

// ---- helper -----------------------------------------------------------------

fn update_policy_via_owner(
    w: &mut VaultWorld,
    per_tx: u64,
    hourly: u64,
    lifetime: u64,
    allow_post_pay: bool,
    whitelist: [Pubkey; WHITELIST_LEN],
) {
    let accounts = credit_vault::accounts::UpdatePolicy {
        owner: w.owner.pubkey(),
        vault: w.vault,
        policy: w.policy,
    };
    let ix = Instruction {
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
    };
    let blockhash = w.svm.latest_blockhash();
    let tx =
        Transaction::new_signed_with_payer(&[ix], Some(&w.owner.pubkey()), &[&w.owner], blockhash);
    w.svm.send_transaction(tx).expect("update_policy failed");
    w.svm.expire_blockhash();
}
