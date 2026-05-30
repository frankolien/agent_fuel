// LiteSVM coverage for the request_spend / approve_spend / cancel_spend flow.

#![allow(deprecated)]

mod common;
use anchor_lang::AccountDeserialize;
use anchor_lang::{Id, InstructionData, ToAccountMetas};
use anchor_spl::token::Token;
use common::*;
use credit_vault::state::{CreditVault, PendingSpend};
use solana_sdk::{
    instruction::Instruction,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
};

fn request_spend(w: &mut VaultWorld, amount: u64) -> Result<Pubkey, ()> {
    let nonce = read_vault(w).pending_count;
    let pending = derive_pending_spend_pda(&w.vault, nonce);
    let accounts = credit_vault::accounts::RequestSpend {
        agent: w.agent.pubkey(),
        vault: w.vault,
        service_token_account: w.service_ata,
        pending_spend: pending,
        system_program: anchor_lang::prelude::System::id(),
    };
    let ix = Instruction {
        program_id: credit_vault::ID,
        accounts: accounts.to_account_metas(None),
        data: credit_vault::instruction::RequestSpend {
            amount_usdc: amount,
        }
        .data(),
    };
    let blockhash = w.svm.latest_blockhash();
    let tx =
        Transaction::new_signed_with_payer(&[ix], Some(&w.agent.pubkey()), &[&w.agent], blockhash);
    w.svm.send_transaction(tx).map_err(|_| ())?;
    w.svm.expire_blockhash();
    Ok(pending)
}

fn approve_spend(w: &mut VaultWorld, pending: &Pubkey) -> Result<(), ()> {
    let accounts = credit_vault::accounts::ApproveSpend {
        owner: w.owner.pubkey(),
        vault: w.vault,
        policy: w.policy,
        pending_spend: *pending,
        vault_token_account: w.vault_ata,
        service_token_account: w.service_ata,
        token_program: Token::id(),
    };
    let ix = Instruction {
        program_id: credit_vault::ID,
        accounts: accounts.to_account_metas(None),
        data: credit_vault::instruction::ApproveSpend {}.data(),
    };
    let blockhash = w.svm.latest_blockhash();
    let tx =
        Transaction::new_signed_with_payer(&[ix], Some(&w.owner.pubkey()), &[&w.owner], blockhash);
    w.svm.send_transaction(tx).map_err(|_| ())?;
    w.svm.expire_blockhash();
    Ok(())
}

fn cancel_spend(w: &mut VaultWorld, pending: &Pubkey, signer: &Keypair) -> Result<(), ()> {
    let accounts = credit_vault::accounts::CancelSpend {
        owner: signer.pubkey(),
        vault: w.vault,
        pending_spend: *pending,
    };
    let ix = Instruction {
        program_id: credit_vault::ID,
        accounts: accounts.to_account_metas(None),
        data: credit_vault::instruction::CancelSpend {}.data(),
    };
    let blockhash = w.svm.latest_blockhash();
    let tx =
        Transaction::new_signed_with_payer(&[ix], Some(&signer.pubkey()), &[signer], blockhash);
    w.svm.send_transaction(tx).map_err(|_| ())?;
    w.svm.expire_blockhash();
    Ok(())
}

fn read_vault(w: &VaultWorld) -> CreditVault {
    CreditVault::try_deserialize(&mut w.svm.get_account(&w.vault).unwrap().data.as_slice()).unwrap()
}

// -------------------------------------------------------------------------

#[test]
fn request_then_approve_releases_over_limit_spend() {
    // per_tx limit = $5, requested amount = $25 — direct spend would reject.
    let mut w = build_world(WorldOpts {
        per_tx_limit_usdc: 5_000_000,
        ..Default::default()
    });

    let pending = request_spend(&mut w, 25_000_000).expect("request_spend failed");

    // No transfer yet — vault balance untouched, total_spent still 0.
    assert_eq!(read_ata_balance(&w.svm, &w.vault_ata), 100_000_000);
    assert_eq!(read_ata_balance(&w.svm, &w.service_ata), 0);
    let vault = read_vault(&w);
    assert_eq!(vault.total_spent, 0);
    assert_eq!(vault.pending_count, 1);

    let ps = PendingSpend::try_deserialize(
        &mut w.svm.get_account(&pending).unwrap().data.as_slice(),
    )
    .unwrap();
    assert_eq!(ps.vault, w.vault);
    assert_eq!(ps.agent, w.agent.pubkey());
    assert_eq!(ps.service, w.service.pubkey());
    assert_eq!(ps.amount_usdc, 25_000_000);
    assert_eq!(ps.nonce, 0);

    // Owner approves → SPL transfer fires, vault counter bumps, PDA closes.
    approve_spend(&mut w, &pending).expect("approve_spend failed");

    assert_eq!(read_ata_balance(&w.svm, &w.vault_ata), 75_000_000);
    assert_eq!(read_ata_balance(&w.svm, &w.service_ata), 25_000_000);
    let vault = read_vault(&w);
    assert_eq!(vault.total_spent, 25_000_000);
    assert!(w.svm.get_account(&pending).is_none(), "pending not closed");
}

#[test]
fn approve_bypasses_hourly_limit_too() {
    // Hourly cap is $10; request asks for $20 in one go.
    let mut w = build_world(WorldOpts {
        hourly_limit_usdc: 10_000_000,
        ..Default::default()
    });
    let pending = request_spend(&mut w, 20_000_000).expect("request_spend failed");
    approve_spend(&mut w, &pending).expect("approve_spend failed");
    assert_eq!(read_ata_balance(&w.svm, &w.service_ata), 20_000_000);
}

#[test]
fn agent_cannot_approve_own_request() {
    let mut w = build_world(WorldOpts {
        per_tx_limit_usdc: 5_000_000,
        ..Default::default()
    });
    let pending = request_spend(&mut w, 25_000_000).expect("request_spend failed");

    // Build approve_spend with the agent in the owner slot — should fail
    // because `has_one = owner` on the vault rejects the agent's pubkey.
    let accounts = credit_vault::accounts::ApproveSpend {
        owner: w.agent.pubkey(),
        vault: w.vault,
        policy: w.policy,
        pending_spend: pending,
        vault_token_account: w.vault_ata,
        service_token_account: w.service_ata,
        token_program: Token::id(),
    };
    let ix = Instruction {
        program_id: credit_vault::ID,
        accounts: accounts.to_account_metas(None),
        data: credit_vault::instruction::ApproveSpend {}.data(),
    };
    let blockhash = w.svm.latest_blockhash();
    let tx =
        Transaction::new_signed_with_payer(&[ix], Some(&w.agent.pubkey()), &[&w.agent], blockhash);
    assert!(w.svm.send_transaction(tx).is_err());
}

#[test]
fn cancel_spend_closes_without_transferring() {
    let mut w = build_world(WorldOpts {
        per_tx_limit_usdc: 5_000_000,
        ..Default::default()
    });
    let pending = request_spend(&mut w, 25_000_000).expect("request_spend failed");

    let owner_clone = w.owner.insecure_clone();
    cancel_spend(&mut w, &pending, &owner_clone).expect("cancel_spend failed");

    assert_eq!(read_ata_balance(&w.svm, &w.vault_ata), 100_000_000);
    assert_eq!(read_ata_balance(&w.svm, &w.service_ata), 0);
    assert!(w.svm.get_account(&pending).is_none(), "pending not closed");
    // Vault counter still incremented — nonces are monotonic.
    assert_eq!(read_vault(&w).pending_count, 1);
}

#[test]
fn approve_rejects_when_frozen() {
    let mut w = build_world(WorldOpts {
        per_tx_limit_usdc: 5_000_000,
        ..Default::default()
    });
    let pending = request_spend(&mut w, 25_000_000).expect("request_spend failed");

    // Freeze the vault before approving.
    let freeze_accounts = credit_vault::accounts::FreezeVault {
        owner: w.owner.pubkey(),
        vault: w.vault,
    };
    let freeze_ix = Instruction {
        program_id: credit_vault::ID,
        accounts: freeze_accounts.to_account_metas(None),
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

    assert!(approve_spend(&mut w, &pending).is_err());
}

#[test]
fn multiple_pending_spends_get_unique_pdas() {
    let mut w = build_world(WorldOpts {
        per_tx_limit_usdc: 5_000_000,
        ..Default::default()
    });
    let first = request_spend(&mut w, 25_000_000).expect("first request failed");
    let second = request_spend(&mut w, 7_000_000).expect("second request failed");
    assert_ne!(first, second);
    assert_eq!(read_vault(&w).pending_count, 2);

    // Owner can approve them in any order.
    approve_spend(&mut w, &second).expect("approve second failed");
    approve_spend(&mut w, &first).expect("approve first failed");
    assert_eq!(read_ata_balance(&w.svm, &w.service_ata), 32_000_000);
}
