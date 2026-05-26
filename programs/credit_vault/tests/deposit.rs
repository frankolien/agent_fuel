// LiteSVM integration tests for `deposit`.

#![allow(deprecated)]

use anchor_lang::prelude::System;
use anchor_lang::{AccountDeserialize, Id, InstructionData, ToAccountMetas};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Token, TokenAccount};
use credit_vault::state::CreditVault;
use litesvm::LiteSVM;
use solana_sdk::{
    instruction::Instruction,
    native_token::LAMPORTS_PER_SOL,
    program_pack::Pack,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_instruction,
    transaction::Transaction,
};

const CREDIT_VAULT_SO: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../target/deploy/credit_vault.so"
);

// Holds everything a deposit test needs: a vault with a funded owner ATA.
struct Fixture {
    svm: LiteSVM,
    owner: Keypair,
    mint: Pubkey,
    mint_authority: Keypair,
    vault: Pubkey,
    vault_ata: Pubkey,
    owner_ata: Pubkey,
}

fn derive_vault_pda(owner: &Pubkey, agent: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"vault", owner.as_ref(), agent.as_ref()],
        &credit_vault::ID,
    )
}

fn derive_policy_pda(vault: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"policy", vault.as_ref()], &credit_vault::ID)
}

fn derive_ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    spl_associated_token_account::get_associated_token_address(owner, mint)
}

fn create_mint(svm: &mut LiteSVM, mint_authority: &Keypair, payer: &Keypair) -> Pubkey {
    let mint = Keypair::new();
    let rent = svm.minimum_balance_for_rent_exemption(spl_token::state::Mint::LEN);
    let create_acct = system_instruction::create_account(
        &payer.pubkey(),
        &mint.pubkey(),
        rent,
        spl_token::state::Mint::LEN as u64,
        &spl_token::ID,
    );
    let init_mint = spl_token::instruction::initialize_mint2(
        &spl_token::ID,
        &mint.pubkey(),
        &mint_authority.pubkey(),
        None,
        6,
    )
    .unwrap();
    let blockhash = svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(
        &[create_acct, init_mint],
        Some(&payer.pubkey()),
        &[payer, &mint],
        blockhash,
    );
    svm.send_transaction(tx).expect("mint creation failed");
    mint.pubkey()
}

// Creates the owner's ATA (via the associated-token program) and mints
// `amount` into it. Returns the ATA address.
fn create_and_fund_owner_ata(
    svm: &mut LiteSVM,
    owner: &Keypair,
    mint: &Pubkey,
    mint_authority: &Keypair,
    amount: u64,
) -> Pubkey {
    let ata = derive_ata(&owner.pubkey(), mint);

    let create_ata = spl_associated_token_account::instruction::create_associated_token_account(
        &owner.pubkey(),
        &owner.pubkey(),
        mint,
        &spl_token::ID,
    );
    let mint_to = spl_token::instruction::mint_to(
        &spl_token::ID,
        mint,
        &ata,
        &mint_authority.pubkey(),
        &[],
        amount,
    )
    .unwrap();

    let blockhash = svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(
        &[create_ata, mint_to],
        Some(&owner.pubkey()),
        &[owner, mint_authority],
        blockhash,
    );
    svm.send_transaction(tx).expect("ATA setup failed");
    ata
}

fn setup() -> Fixture {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(credit_vault::ID, CREDIT_VAULT_SO)
        .expect("credit_vault.so missing — run `anchor build` first");

    let owner = Keypair::new();
    let mint_authority = Keypair::new();
    let agent = Keypair::new();
    svm.airdrop(&owner.pubkey(), 20 * LAMPORTS_PER_SOL).unwrap();
    svm.airdrop(&mint_authority.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();

    let mint = create_mint(&mut svm, &mint_authority, &owner);
    let (vault, _) = derive_vault_pda(&owner.pubkey(), &agent.pubkey());
    let (policy, _) = derive_policy_pda(&vault);
    let vault_ata = derive_ata(&vault, &mint);

    // create_vault
    let create_ix = {
        let accounts = credit_vault::accounts::CreateVault {
            owner: owner.pubkey(),
            agent: agent.pubkey(),
            usdc_mint: mint,
            vault,
            policy,
            vault_token_account: vault_ata,
            token_program: Token::id(),
            associated_token_program: AssociatedToken::id(),
            system_program: System::id(),
        };
        let args = credit_vault::instruction::CreateVault {
            per_tx_limit_usdc: 1_000_000,
            hourly_limit_usdc: 10_000_000,
            lifetime_limit_usdc: 100_000_000,
            allow_post_pay: false,
        };
        Instruction {
            program_id: credit_vault::ID,
            accounts: accounts.to_account_metas(None),
            data: args.data(),
        }
    };
    let blockhash = svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(
        &[create_ix],
        Some(&owner.pubkey()),
        &[&owner],
        blockhash,
    );
    svm.send_transaction(tx).expect("create_vault failed");

    // Fund the owner's ATA with 50 USDC.
    let owner_ata = create_and_fund_owner_ata(&mut svm, &owner, &mint, &mint_authority, 50_000_000);

    Fixture {
        svm,
        owner,
        mint,
        mint_authority,
        vault,
        vault_ata,
        owner_ata,
    }
}

fn build_deposit_ix(
    owner: &Pubkey,
    vault: &Pubkey,
    owner_ata: &Pubkey,
    vault_ata: &Pubkey,
    amount_usdc: u64,
) -> Instruction {
    let accounts = credit_vault::accounts::Deposit {
        owner: *owner,
        vault: *vault,
        owner_token_account: *owner_ata,
        vault_token_account: *vault_ata,
        token_program: Token::id(),
    };
    let args = credit_vault::instruction::Deposit { amount_usdc };
    Instruction {
        program_id: credit_vault::ID,
        accounts: accounts.to_account_metas(None),
        data: args.data(),
    }
}

fn read_ata_balance(svm: &LiteSVM, ata: &Pubkey) -> u64 {
    let acct = svm.get_account(ata).unwrap();
    TokenAccount::try_deserialize(&mut acct.data.as_slice())
        .unwrap()
        .amount
}

#[test]
fn deposit_happy_path_moves_tokens_and_bumps_counter() {
    let Fixture {
        mut svm,
        owner,
        mint: _,
        mint_authority: _,
        vault,
        vault_ata,
        owner_ata,
    } = setup();

    let ix = build_deposit_ix(&owner.pubkey(), &vault, &owner_ata, &vault_ata, 5_000_000);
    let blockhash = svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(&[ix], Some(&owner.pubkey()), &[&owner], blockhash);
    svm.send_transaction(tx).expect("deposit failed");

    assert_eq!(read_ata_balance(&svm, &vault_ata), 5_000_000);
    assert_eq!(read_ata_balance(&svm, &owner_ata), 45_000_000);

    let vault_acct = svm.get_account(&vault).unwrap();
    let v = CreditVault::try_deserialize(&mut vault_acct.data.as_slice()).unwrap();
    assert_eq!(v.total_deposited, 5_000_000);
    assert!(v.last_active_slot >= v.created_slot);
}

#[test]
fn deposit_accumulates_across_calls() {
    let Fixture {
        mut svm,
        owner,
        mint: _,
        mint_authority: _,
        vault,
        vault_ata,
        owner_ata,
    } = setup();

    for amount in [1_000_000u64, 2_000_000, 3_000_000] {
        let ix = build_deposit_ix(&owner.pubkey(), &vault, &owner_ata, &vault_ata, amount);
        let blockhash = svm.latest_blockhash();
        let tx =
            Transaction::new_signed_with_payer(&[ix], Some(&owner.pubkey()), &[&owner], blockhash);
        svm.send_transaction(tx).expect("deposit failed");
        svm.expire_blockhash();
    }

    assert_eq!(read_ata_balance(&svm, &vault_ata), 6_000_000);
    let v = CreditVault::try_deserialize(&mut svm.get_account(&vault).unwrap().data.as_slice())
        .unwrap();
    assert_eq!(v.total_deposited, 6_000_000);
}

#[test]
fn deposit_rejects_zero_amount() {
    let Fixture {
        mut svm,
        owner,
        mint: _,
        mint_authority: _,
        vault,
        vault_ata,
        owner_ata,
    } = setup();

    let ix = build_deposit_ix(&owner.pubkey(), &vault, &owner_ata, &vault_ata, 0);
    let blockhash = svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(&[ix], Some(&owner.pubkey()), &[&owner], blockhash);
    let result = svm.send_transaction(tx);
    assert!(result.is_err(), "zero amount must be rejected");
}

#[test]
fn deposit_rejects_non_owner_signer() {
    let Fixture {
        mut svm,
        owner: _,
        mint,
        mint_authority,
        vault,
        vault_ata,
        owner_ata: _,
    } = setup();

    // Attacker has their own ATA funded with USDC and tries to deposit into
    // someone else's vault. `has_one = owner` must reject.
    let attacker = Keypair::new();
    svm.airdrop(&attacker.pubkey(), 5 * LAMPORTS_PER_SOL)
        .unwrap();
    let attacker_ata =
        create_and_fund_owner_ata(&mut svm, &attacker, &mint, &mint_authority, 10_000_000);

    let ix = build_deposit_ix(
        &attacker.pubkey(),
        &vault,
        &attacker_ata,
        &vault_ata,
        1_000_000,
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
        "non-owner signer must be rejected by has_one = owner"
    );

    // And the vault balance must not have moved.
    assert_eq!(read_ata_balance(&svm, &vault_ata), 0);
}

#[test]
fn deposit_rejects_wrong_vault_token_account() {
    // Attacker passes their own token account as `vault_token_account`,
    // hoping to siphon USDC by routing the transfer destination. The
    // `constraint = key == vault.vault_token_account` check blocks it.
    let Fixture {
        mut svm,
        owner,
        mint,
        mint_authority,
        vault,
        vault_ata: _,
        owner_ata,
    } = setup();

    let attacker = Keypair::new();
    svm.airdrop(&attacker.pubkey(), 5 * LAMPORTS_PER_SOL)
        .unwrap();
    let attacker_ata = create_and_fund_owner_ata(&mut svm, &attacker, &mint, &mint_authority, 0);

    let ix = build_deposit_ix(
        &owner.pubkey(),
        &vault,
        &owner_ata,
        &attacker_ata,
        1_000_000,
    );
    let blockhash = svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(&[ix], Some(&owner.pubkey()), &[&owner], blockhash);
    let result = svm.send_transaction(tx);
    assert!(
        result.is_err(),
        "substituted vault_token_account must be rejected"
    );

    assert_eq!(read_ata_balance(&svm, &attacker_ata), 0);
    assert_eq!(read_ata_balance(&svm, &owner_ata), 50_000_000);
}

#[test]
fn deposit_rejects_wrong_mint() {
    // owner_token_account on a different mint than vault.usdc_mint must be
    // rejected by the `mint == vault.usdc_mint` constraint.
    let Fixture {
        mut svm,
        owner,
        mint: _,
        mint_authority,
        vault,
        vault_ata,
        owner_ata: _,
    } = setup();

    let other_mint = create_mint(&mut svm, &mint_authority, &owner);
    let other_ata =
        create_and_fund_owner_ata(&mut svm, &owner, &other_mint, &mint_authority, 5_000_000);

    let ix = build_deposit_ix(&owner.pubkey(), &vault, &other_ata, &vault_ata, 1_000_000);
    let blockhash = svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(&[ix], Some(&owner.pubkey()), &[&owner], blockhash);
    let result = svm.send_transaction(tx);
    assert!(
        result.is_err(),
        "owner_token_account on the wrong mint must be rejected"
    );
}
