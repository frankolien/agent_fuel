// LiteSVM integration tests for `create_vault`.

// solana_sdk::system_instruction is deprecated in favour of solana_system_interface,
// but pulling in another crate just for this one helper isn't worth the dependency
// bloat in a test file. Mirrors the crate-root allow in lib.rs.
#![allow(deprecated)]

use anchor_lang::prelude::System;
use anchor_lang::{AccountDeserialize, Id, InstructionData, ToAccountMetas};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Token, TokenAccount};
use credit_vault::state::{CreditVault, SpendPolicy};
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

fn setup_svm() -> LiteSVM {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(credit_vault::ID, CREDIT_VAULT_SO)
        .expect("credit_vault.so missing — run `anchor build` first");
    svm
}

// Mints an SPL token with 6 decimals (matching USDC) and returns the mint pubkey.
// The `mint_authority` keypair signs the initial mint creation.
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

#[allow(clippy::too_many_arguments)]
fn build_create_vault_ix(
    owner: &Pubkey,
    agent: &Pubkey,
    mint: &Pubkey,
    vault: &Pubkey,
    policy: &Pubkey,
    vault_ata: &Pubkey,
    per_tx_limit_usdc: u64,
    hourly_limit_usdc: u64,
    lifetime_limit_usdc: u64,
    allow_post_pay: bool,
) -> Instruction {
    let accounts = credit_vault::accounts::CreateVault {
        owner: *owner,
        agent: *agent,
        usdc_mint: *mint,
        vault: *vault,
        policy: *policy,
        vault_token_account: *vault_ata,
        token_program: Token::id(),
        associated_token_program: AssociatedToken::id(),
        system_program: System::id(),
    };
    let args = credit_vault::instruction::CreateVault {
        per_tx_limit_usdc,
        hourly_limit_usdc,
        lifetime_limit_usdc,
        allow_post_pay,
    };
    Instruction {
        program_id: credit_vault::ID,
        accounts: accounts.to_account_metas(None),
        data: args.data(),
    }
}

#[test]
fn create_vault_happy_path() {
    let mut svm = setup_svm();
    let owner = Keypair::new();
    let mint_authority = Keypair::new();
    let agent = Keypair::new();
    svm.airdrop(&owner.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();
    svm.airdrop(&mint_authority.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();

    let mint = create_mint(&mut svm, &mint_authority, &owner);
    let (vault_pda, _) = derive_vault_pda(&owner.pubkey(), &agent.pubkey());
    let (policy_pda, _) = derive_policy_pda(&vault_pda);
    let vault_ata = derive_ata(&vault_pda, &mint);

    let ix = build_create_vault_ix(
        &owner.pubkey(),
        &agent.pubkey(),
        &mint,
        &vault_pda,
        &policy_pda,
        &vault_ata,
        1_000_000,   // per-tx: 1 USDC
        10_000_000,  // hourly: 10 USDC
        100_000_000, // lifetime: 100 USDC
        false,
    );
    let blockhash = svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(&[ix], Some(&owner.pubkey()), &[&owner], blockhash);
    svm.send_transaction(tx).expect("create_vault failed");

    // Vault assertions
    let vault_acct = svm.get_account(&vault_pda).expect("vault missing");
    let vault = CreditVault::try_deserialize(&mut vault_acct.data.as_slice()).unwrap();
    assert_eq!(vault.owner, owner.pubkey());
    assert_eq!(vault.agent, agent.pubkey());
    assert_eq!(vault.usdc_mint, mint);
    assert_eq!(vault.vault_token_account, vault_ata);
    assert_eq!(vault.total_deposited, 0);
    assert_eq!(vault.total_withdrawn, 0);
    assert_eq!(vault.total_spent, 0);
    assert_eq!(vault.total_claimed, 0);
    assert!(!vault.frozen);
    assert_eq!(vault.created_slot, vault.last_active_slot);
    assert_eq!(vault_acct.data.len(), CreditVault::ACCOUNT_SIZE);

    // Policy assertions
    let policy_acct = svm.get_account(&policy_pda).expect("policy missing");
    let policy = SpendPolicy::try_deserialize(&mut policy_acct.data.as_slice()).unwrap();
    assert_eq!(policy.vault, vault_pda);
    assert_eq!(policy.whitelist, [Pubkey::default(); 8]);
    assert_eq!(policy.per_tx_limit_usdc, 1_000_000);
    assert_eq!(policy.hourly_limit_usdc, 10_000_000);
    assert_eq!(policy.lifetime_limit_usdc, 100_000_000);
    assert_eq!(policy.hourly_window_start_slot, 0);
    assert_eq!(policy.hourly_window_spent_usdc, 0);
    assert!(!policy.allow_post_pay);
    assert_eq!(policy_acct.data.len(), SpendPolicy::ACCOUNT_SIZE);

    // ATA assertions
    let ata_acct = svm.get_account(&vault_ata).expect("ATA missing");
    let ata = TokenAccount::try_deserialize(&mut ata_acct.data.as_slice()).unwrap();
    assert_eq!(ata.owner, vault_pda, "ATA authority must be the vault PDA");
    assert_eq!(ata.mint, mint);
    assert_eq!(ata.amount, 0);
}

#[test]
fn create_vault_rejects_re_creation() {
    let mut svm = setup_svm();
    let owner = Keypair::new();
    let mint_authority = Keypair::new();
    let agent = Keypair::new();
    svm.airdrop(&owner.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();
    svm.airdrop(&mint_authority.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();

    let mint = create_mint(&mut svm, &mint_authority, &owner);
    let (vault_pda, _) = derive_vault_pda(&owner.pubkey(), &agent.pubkey());
    let (policy_pda, _) = derive_policy_pda(&vault_pda);
    let vault_ata = derive_ata(&vault_pda, &mint);

    let ix = build_create_vault_ix(
        &owner.pubkey(),
        &agent.pubkey(),
        &mint,
        &vault_pda,
        &policy_pda,
        &vault_ata,
        0,
        0,
        0,
        true,
    );
    let blockhash = svm.latest_blockhash();
    let tx1 = Transaction::new_signed_with_payer(
        std::slice::from_ref(&ix),
        Some(&owner.pubkey()),
        &[&owner],
        blockhash,
    );
    svm.send_transaction(tx1)
        .expect("first create must succeed");

    svm.expire_blockhash();
    let blockhash = svm.latest_blockhash();
    let tx2 =
        Transaction::new_signed_with_payer(&[ix], Some(&owner.pubkey()), &[&owner], blockhash);
    let result = svm.send_transaction(tx2);
    assert!(result.is_err(), "re-create must fail");
}

#[test]
fn create_vault_rejects_missing_owner_signature() {
    let mut svm = setup_svm();
    let owner = Keypair::new();
    let mint_authority = Keypair::new();
    let agent = Keypair::new();
    svm.airdrop(&owner.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();
    svm.airdrop(&mint_authority.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();

    let mint = create_mint(&mut svm, &mint_authority, &owner);
    let (vault_pda, _) = derive_vault_pda(&owner.pubkey(), &agent.pubkey());
    let (policy_pda, _) = derive_policy_pda(&vault_pda);
    let vault_ata = derive_ata(&vault_pda, &mint);

    let other_payer = Keypair::new();
    svm.airdrop(&other_payer.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();

    let mut metas = credit_vault::accounts::CreateVault {
        owner: owner.pubkey(),
        agent: agent.pubkey(),
        usdc_mint: mint,
        vault: vault_pda,
        policy: policy_pda,
        vault_token_account: vault_ata,
        token_program: Token::id(),
        associated_token_program: AssociatedToken::id(),
        system_program: System::id(),
    }
    .to_account_metas(None);
    for meta in metas.iter_mut() {
        if meta.pubkey == owner.pubkey() {
            meta.is_signer = false;
        }
    }

    let ix = Instruction {
        program_id: credit_vault::ID,
        accounts: metas,
        data: credit_vault::instruction::CreateVault {
            per_tx_limit_usdc: 0,
            hourly_limit_usdc: 0,
            lifetime_limit_usdc: 0,
            allow_post_pay: false,
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
    assert!(result.is_err(), "missing owner signature must fail");
}

#[test]
fn create_vault_distinct_owner_agent_pairs_get_distinct_pdas() {
    let mut svm = setup_svm();
    let owner = Keypair::new();
    let agent_a = Keypair::new();
    let agent_b = Keypair::new();
    let mint_authority = Keypair::new();
    svm.airdrop(&owner.pubkey(), 20 * LAMPORTS_PER_SOL).unwrap();
    svm.airdrop(&mint_authority.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();

    let mint = create_mint(&mut svm, &mint_authority, &owner);

    let (vault_a, _) = derive_vault_pda(&owner.pubkey(), &agent_a.pubkey());
    let (vault_b, _) = derive_vault_pda(&owner.pubkey(), &agent_b.pubkey());
    assert_ne!(vault_a, vault_b);

    for (vault, agent) in [(vault_a, &agent_a), (vault_b, &agent_b)] {
        let (policy, _) = derive_policy_pda(&vault);
        let ata = derive_ata(&vault, &mint);
        let ix = build_create_vault_ix(
            &owner.pubkey(),
            &agent.pubkey(),
            &mint,
            &vault,
            &policy,
            &ata,
            500_000,
            0,
            0,
            false,
        );
        let blockhash = svm.latest_blockhash();
        let tx =
            Transaction::new_signed_with_payer(&[ix], Some(&owner.pubkey()), &[&owner], blockhash);
        svm.send_transaction(tx).expect("create_vault failed");
        svm.expire_blockhash();
    }

    let va = CreditVault::try_deserialize(&mut svm.get_account(&vault_a).unwrap().data.as_slice())
        .unwrap();
    let vb = CreditVault::try_deserialize(&mut svm.get_account(&vault_b).unwrap().data.as_slice())
        .unwrap();
    assert_eq!(va.agent, agent_a.pubkey());
    assert_eq!(vb.agent, agent_b.pubkey());
}
