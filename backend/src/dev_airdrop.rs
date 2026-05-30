// Dev-only: mint dev USDC to any wallet on demand.
//
// Wired only when AGENT_FUEL_USDC_MINT, SOLANA_RPC_URL, and ONE of
// (AGENT_FUEL_USDC_MINT_AUTHORITY_B64, AGENT_FUEL_USDC_MINT_AUTHORITY_PATH)
// are set at startup. Production deploys leave both authority vars unset so
// the route never registers — even though the solana-sdk dep is linked.
//
// SECURITY: the mint authority secret key is a devnet-only secret. Treat it
// as low value but rotatable: if it leaks, mint a new dev USDC mint and
// re-deploy. Never use this pattern for a mainnet mint authority — host the
// key in an HSM / KMS / paymaster service instead.

use std::fs;
use std::str::FromStr;
use std::sync::Arc;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Keypair;

pub struct DevAirdropState {
    pub rpc_url: String,
    pub mint: Pubkey,
    pub mint_authority: Keypair,
}

#[derive(Clone)]
pub struct DevAirdropHandle(pub Arc<DevAirdropState>);

pub fn maybe_build(
    rpc_url: Option<&str>,
    mint_b58: Option<&str>,
    authority_path: Option<&str>,
    authority_b64: Option<&str>,
) -> anyhow::Result<Option<DevAirdropHandle>> {
    let (rpc_url, mint_b58) = match (rpc_url, mint_b58) {
        (Some(r), Some(m)) => (r, m),
        _ => return Ok(None),
    };
    let key_bytes = match (authority_b64, authority_path) {
        (Some(b64), _) => load_keypair_from_b64(b64)?,
        (None, Some(path)) => load_keypair_from_path(path)?,
        (None, None) => return Ok(None),
    };
    let mint = Pubkey::from_str(mint_b58)
        .map_err(|e| anyhow::anyhow!("AGENT_FUEL_USDC_MINT is not a valid pubkey: {e}"))?;
    let mint_authority = Keypair::try_from(key_bytes.as_slice())
        .map_err(|e| anyhow::anyhow!("invalid ed25519 keypair bytes: {e}"))?;
    Ok(Some(DevAirdropHandle(Arc::new(DevAirdropState {
        rpc_url: rpc_url.to_string(),
        mint,
        mint_authority,
    }))))
}

fn load_keypair_from_path(path: &str) -> anyhow::Result<Vec<u8>> {
    let raw = fs::read_to_string(path).map_err(|e| {
        anyhow::anyhow!("failed to read AGENT_FUEL_USDC_MINT_AUTHORITY_PATH={path}: {e}")
    })?;
    let bytes: Vec<u8> = serde_json::from_str(&raw)
        .map_err(|e| anyhow::anyhow!("mint authority keypair is not a JSON byte array: {e}"))?;
    enforce_len(&bytes)?;
    Ok(bytes)
}

fn load_keypair_from_b64(b64: &str) -> anyhow::Result<Vec<u8>> {
    // Accept the raw base64 of either:
    //   (a) the 64-byte secret key (preferred — `base64 -i ~/.config/solana/id.json`
    //       after first stripping JSON brackets, OR just `base64` of the raw bytes)
    //   (b) the JSON array form `[123, 45, 67, ...]` base64-encoded
    let decoded = STANDARD.decode(b64.trim()).map_err(|e| {
        anyhow::anyhow!("AGENT_FUEL_USDC_MINT_AUTHORITY_B64 is not valid base64: {e}")
    })?;
    // Heuristic: if the decoded body starts with '[' assume it's JSON form.
    let bytes = if decoded.first() == Some(&b'[') {
        serde_json::from_slice::<Vec<u8>>(&decoded).map_err(|e| {
            anyhow::anyhow!("decoded AGENT_FUEL_USDC_MINT_AUTHORITY_B64 is not a JSON array: {e}")
        })?
    } else {
        decoded
    };
    enforce_len(&bytes)?;
    Ok(bytes)
}

fn enforce_len(bytes: &[u8]) -> anyhow::Result<()> {
    if bytes.len() != 64 {
        return Err(anyhow::anyhow!(
            "expected 64-byte [seed || pubkey] keypair, got {} bytes",
            bytes.len()
        ));
    }
    Ok(())
}
