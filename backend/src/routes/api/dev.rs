use std::str::FromStr;

use actix_web::{web, HttpResponse, Responder};
use serde::{Deserialize, Serialize};
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::instruction::{AccountMeta, Instruction};
use solana_sdk::pubkey;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Signer;
use solana_sdk::transaction::Transaction;

use crate::dev_airdrop::DevAirdropHandle;

const TOKEN_PROGRAM_ID: Pubkey = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA_PROGRAM_ID: Pubkey = pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const SYSTEM_PROGRAM_ID: Pubkey = pubkey!("11111111111111111111111111111111");

const DEFAULT_AMOUNT_USDC: u64 = 1_000;
const MAX_AMOUNT_USDC: u64 = 10_000;

#[derive(Deserialize)]
pub struct AirdropRequest {
    pub wallet: String,
    #[serde(default)]
    pub amount_usdc: Option<u64>,
}

#[derive(Serialize)]
pub struct AirdropResponse {
    pub signature: String,
    pub recipient_ata: String,
    pub mint: String,
    pub amount_minted_micro: u64,
}

pub async fn airdrop(
    handle: web::Data<DevAirdropHandle>,
    body: web::Json<AirdropRequest>,
) -> impl Responder {
    let amount = body.amount_usdc.unwrap_or(DEFAULT_AMOUNT_USDC);
    if amount == 0 || amount > MAX_AMOUNT_USDC {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": format!("amount_usdc must be 1..={MAX_AMOUNT_USDC}"),
        }));
    }
    let recipient = match Pubkey::from_str(body.wallet.trim()) {
        Ok(pk) => pk,
        Err(_) => {
            return HttpResponse::BadRequest()
                .json(serde_json::json!({"error": "invalid wallet pubkey"}));
        }
    };
    match perform_airdrop(&handle.0, recipient, amount).await {
        Ok(resp) => HttpResponse::Ok().json(resp),
        Err(err) => {
            tracing::error!(error = %err, wallet = %recipient, amount, "dev airdrop failed");
            HttpResponse::BadGateway().json(serde_json::json!({
                "error": format!("airdrop failed: {err}"),
            }))
        }
    }
}

async fn perform_airdrop(
    state: &crate::dev_airdrop::DevAirdropState,
    recipient: Pubkey,
    amount_usdc: u64,
) -> anyhow::Result<AirdropResponse> {
    let micro = amount_usdc
        .checked_mul(1_000_000)
        .ok_or_else(|| anyhow::anyhow!("amount overflow"))?;
    let rpc = RpcClient::new_with_commitment(state.rpc_url.clone(), CommitmentConfig::confirmed());
    let authority_pk = state.mint_authority.pubkey();
    let ata = derive_ata(&recipient, &state.mint);

    let mut ixs = Vec::with_capacity(2);
    if rpc.get_account(&ata).await.is_err() {
        ixs.push(create_ata_ix(&authority_pk, &recipient, &state.mint, &ata));
    }
    ixs.push(mint_to_ix(&state.mint, &ata, &authority_pk, micro));

    let blockhash = rpc.get_latest_blockhash().await?;
    let tx = Transaction::new_signed_with_payer(
        &ixs,
        Some(&authority_pk),
        &[&state.mint_authority],
        blockhash,
    );
    let sig = rpc.send_and_confirm_transaction(&tx).await?;
    Ok(AirdropResponse {
        signature: sig.to_string(),
        recipient_ata: ata.to_string(),
        mint: state.mint.to_string(),
        amount_minted_micro: micro,
    })
}

fn derive_ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[owner.as_ref(), TOKEN_PROGRAM_ID.as_ref(), mint.as_ref()],
        &ATA_PROGRAM_ID,
    )
    .0
}

fn create_ata_ix(payer: &Pubkey, owner: &Pubkey, mint: &Pubkey, ata: &Pubkey) -> Instruction {
    Instruction {
        program_id: ATA_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(*payer, true),
            AccountMeta::new(*ata, false),
            AccountMeta::new_readonly(*owner, false),
            AccountMeta::new_readonly(*mint, false),
            AccountMeta::new_readonly(SYSTEM_PROGRAM_ID, false),
            AccountMeta::new_readonly(TOKEN_PROGRAM_ID, false),
        ],
        data: vec![],
    }
}

fn mint_to_ix(mint: &Pubkey, ata: &Pubkey, authority: &Pubkey, amount: u64) -> Instruction {
    // SPL Token instruction discriminator 7 = MintTo. Layout: [u8 disc | u64 le amount].
    let mut data = Vec::with_capacity(9);
    data.push(7);
    data.extend_from_slice(&amount.to_le_bytes());
    Instruction {
        program_id: TOKEN_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(*mint, false),
            AccountMeta::new(*ata, false),
            AccountMeta::new_readonly(*authority, true),
        ],
        data,
    }
}
