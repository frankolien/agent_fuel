// LiteSVM tests for `claim` — post-pay settlement (slice 2.12).

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

fn claim_ix(
    service: &Pubkey,
    vault: &Pubkey,
    policy: &Pubkey,
    vault_ata: &Pubkey,
    service_ata: &Pubkey,
    amount: u64,
) -> Instruction {
    let accounts = credit_vault::accounts::Claim {
        service: *service,
        vault: *vault,
        policy: *policy,
        vault_token_account: *vault_ata,
        service_token_account: *service_ata,
        token_program: Token::id(),
    };
    Instruction {
        program_id: credit_vault::ID,
        accounts: accounts.to_account_metas(None),
        data: credit_vault::instruction::Claim {
            amount_usdc: amount,
        }
        .data(),
    }
}

fn send_claim(w: &mut VaultWorld, amount: u64) -> Result<(), ()> {
    let ix = claim_ix(
        &w.service.pubkey(),
        &w.vault,
        &w.policy,
        &w.vault_ata,
        &w.service_ata,
        amount,
    );
    let blockhash = w.svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&w.service.pubkey()),
        &[&w.service],
        blockhash,
    );
    w.svm.send_transaction(tx).map_err(|_| ())?;
    w.svm.expire_blockhash();
    Ok(())
}

#[test]
fn claim_rejected_when_post_pay_disabled() {
    let mut w = build_world(WorldOpts {
        allow_post_pay: false,
        ..Default::default()
    });
    let result = send_claim(&mut w, 1_000_000);
    assert!(result.is_err(), "post-pay disabled must reject");
}

#[test]
fn claim_happy_path_when_post_pay_enabled() {
    let mut w = build_world(WorldOpts {
        allow_post_pay: true,
        ..Default::default()
    });

    send_claim(&mut w, 4_000_000).expect("claim failed");

    assert_eq!(read_ata_balance(&w.svm, &w.service_ata), 4_000_000);
    assert_eq!(read_ata_balance(&w.svm, &w.vault_ata), 96_000_000);

    let vault =
        CreditVault::try_deserialize(&mut w.svm.get_account(&w.vault).unwrap().data.as_slice())
            .unwrap();
    // Claim bumps BOTH counters: total_spent counts toward lifetime/hourly
    // gates uniformly with spend, and total_claimed splits out the post-pay
    // share for off-chain accounting.
    assert_eq!(vault.total_spent, 4_000_000);
    assert_eq!(vault.total_claimed, 4_000_000);
}

#[test]
fn claim_shares_lifetime_ceiling_with_spend() {
    let mut w = build_world(WorldOpts {
        allow_post_pay: true,
        lifetime_limit_usdc: 5_000_000,
        ..Default::default()
    });

    send_claim(&mut w, 3_000_000).expect("first claim ok");
    let result = send_claim(&mut w, 3_000_000);
    assert!(
        result.is_err(),
        "claim must trip the shared lifetime ceiling"
    );
}

#[test]
fn claim_rejected_when_vault_frozen() {
    let mut w = build_world(WorldOpts {
        allow_post_pay: true,
        ..Default::default()
    });

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

    let result = send_claim(&mut w, 1_000_000);
    assert!(result.is_err(), "claim on frozen vault must reject");
}

#[test]
fn claim_rejected_when_signer_does_not_own_destination_ata() {
    let mut w = build_world(WorldOpts {
        allow_post_pay: true,
        ..Default::default()
    });

    // Attacker tries to claim into the legitimate service's ATA.
    let attacker = Keypair::new();
    w.svm.airdrop(&attacker.pubkey(), 2_000_000_000).unwrap();

    let ix = claim_ix(
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
    assert!(
        result.is_err(),
        "claim where signer != service_token_account.owner must reject"
    );
}
