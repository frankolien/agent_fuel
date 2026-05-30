// Shared LiteSVM scaffolding for credit_vault integration tests. Each test
// binary `use`s this via `mod common;`. Different test binaries pull
// different subsets of these helpers; `dead_code` is allowed at module scope
// rather than rotting unused fields out of `VaultWorld`.

#![allow(deprecated, dead_code)]

use anchor_lang::prelude::System;
use anchor_lang::{Id, InstructionData, ToAccountMetas};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::Token;
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

pub const CREDIT_VAULT_SO: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../target/deploy/credit_vault.so"
);

pub fn init_svm() -> LiteSVM {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(credit_vault::ID, CREDIT_VAULT_SO)
        .expect("credit_vault.so missing — run `anchor build` first");
    svm
}

pub fn derive_vault_pda(owner: &Pubkey, agent: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[b"vault", owner.as_ref(), agent.as_ref()],
        &credit_vault::ID,
    )
    .0
}

pub fn derive_policy_pda(vault: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"policy", vault.as_ref()], &credit_vault::ID).0
}

pub fn derive_ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    spl_associated_token_account::get_associated_token_address(owner, mint)
}

pub fn create_mint(svm: &mut LiteSVM, mint_authority: &Keypair, payer: &Keypair) -> Pubkey {
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

// Creates `owner`'s ATA for `mint` and mints `amount` to it.
pub fn create_and_fund_ata(
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
    let mut ixs = vec![create_ata];
    if amount > 0 {
        ixs.push(
            spl_token::instruction::mint_to(
                &spl_token::ID,
                mint,
                &ata,
                &mint_authority.pubkey(),
                &[],
                amount,
            )
            .unwrap(),
        );
    }
    let blockhash = svm.latest_blockhash();
    let signers: Vec<&Keypair> = if amount > 0 {
        vec![owner, mint_authority]
    } else {
        vec![owner]
    };
    let tx = Transaction::new_signed_with_payer(&ixs, Some(&owner.pubkey()), &signers, blockhash);
    svm.send_transaction(tx).expect("ATA setup failed");
    ata
}

/// Full vault world: returns a SVM with an agent + owner + service + vault +
/// funded vault ATA + a service ATA ready to receive. Policy starts with no
/// limits and no whitelist (max permissive).
pub struct VaultWorld {
    pub svm: LiteSVM,
    pub owner: Keypair,
    pub agent: Keypair,
    pub service: Keypair,
    pub mint: Pubkey,
    pub mint_authority: Keypair,
    pub vault: Pubkey,
    pub policy: Pubkey,
    pub vault_ata: Pubkey,
    pub service_ata: Pubkey,
}

pub struct WorldOpts {
    pub per_tx_limit_usdc: u64,
    pub hourly_limit_usdc: u64,
    pub lifetime_limit_usdc: u64,
    pub allow_post_pay: bool,
    /// USDC to deposit into the vault after creation.
    pub deposit_amount: u64,
}

impl Default for WorldOpts {
    fn default() -> Self {
        Self {
            per_tx_limit_usdc: 0,
            hourly_limit_usdc: 0,
            lifetime_limit_usdc: 0,
            allow_post_pay: false,
            deposit_amount: 100_000_000, // 100 USDC
        }
    }
}

pub fn build_world(opts: WorldOpts) -> VaultWorld {
    let mut svm = init_svm();
    let owner = Keypair::new();
    let agent = Keypair::new();
    let service = Keypair::new();
    let mint_authority = Keypair::new();
    svm.airdrop(&owner.pubkey(), 50 * LAMPORTS_PER_SOL).unwrap();
    svm.airdrop(&agent.pubkey(), LAMPORTS_PER_SOL).unwrap();
    svm.airdrop(&service.pubkey(), 5 * LAMPORTS_PER_SOL)
        .unwrap();
    svm.airdrop(&mint_authority.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();

    let mint = create_mint(&mut svm, &mint_authority, &owner);
    let vault = derive_vault_pda(&owner.pubkey(), &agent.pubkey());
    let policy = derive_policy_pda(&vault);
    let vault_ata = derive_ata(&vault, &mint);

    // create_vault
    {
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
        let ix = Instruction {
            program_id: credit_vault::ID,
            accounts: accounts.to_account_metas(None),
            data: credit_vault::instruction::CreateVault {
                per_tx_limit_usdc: opts.per_tx_limit_usdc,
                hourly_limit_usdc: opts.hourly_limit_usdc,
                lifetime_limit_usdc: opts.lifetime_limit_usdc,
                allow_post_pay: opts.allow_post_pay,
            }
            .data(),
        };
        let blockhash = svm.latest_blockhash();
        let tx =
            Transaction::new_signed_with_payer(&[ix], Some(&owner.pubkey()), &[&owner], blockhash);
        svm.send_transaction(tx).expect("create_vault failed");
    }

    // Service ATA (empty).
    let service_ata = create_and_fund_ata(&mut svm, &service, &mint, &mint_authority, 0);

    // Owner ATA + deposit.
    if opts.deposit_amount > 0 {
        let owner_ata = create_and_fund_ata(
            &mut svm,
            &owner,
            &mint,
            &mint_authority,
            opts.deposit_amount,
        );
        let accounts = credit_vault::accounts::Deposit {
            owner: owner.pubkey(),
            vault,
            owner_token_account: owner_ata,
            vault_token_account: vault_ata,
            token_program: Token::id(),
        };
        let ix = Instruction {
            program_id: credit_vault::ID,
            accounts: accounts.to_account_metas(None),
            data: credit_vault::instruction::Deposit {
                amount_usdc: opts.deposit_amount,
            }
            .data(),
        };
        let blockhash = svm.latest_blockhash();
        let tx =
            Transaction::new_signed_with_payer(&[ix], Some(&owner.pubkey()), &[&owner], blockhash);
        svm.send_transaction(tx).expect("seed deposit failed");
    }

    VaultWorld {
        svm,
        owner,
        agent,
        service,
        mint,
        mint_authority,
        vault,
        policy,
        vault_ata,
        service_ata,
    }
}

pub fn read_ata_balance(svm: &LiteSVM, ata: &Pubkey) -> u64 {
    let acct = svm.get_account(ata).unwrap();
    use anchor_lang::AccountDeserialize;
    anchor_spl::token::TokenAccount::try_deserialize(&mut acct.data.as_slice())
        .unwrap()
        .amount
}

pub fn build_spend_ix(
    agent: &Pubkey,
    vault: &Pubkey,
    policy: &Pubkey,
    vault_ata: &Pubkey,
    service_ata: &Pubkey,
    amount: u64,
) -> Instruction {
    let accounts = credit_vault::accounts::Spend {
        agent: *agent,
        vault: *vault,
        policy: *policy,
        vault_token_account: *vault_ata,
        service_token_account: *service_ata,
        token_program: Token::id(),
    };
    Instruction {
        program_id: credit_vault::ID,
        accounts: accounts.to_account_metas(None),
        data: credit_vault::instruction::Spend {
            amount_usdc: amount,
        }
        .data(),
    }
}

pub fn derive_pending_spend_pda(vault: &Pubkey, nonce: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[b"pending", vault.as_ref(), &nonce.to_le_bytes()],
        &credit_vault::ID,
    )
    .0
}
