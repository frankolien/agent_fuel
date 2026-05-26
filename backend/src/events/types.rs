use borsh::{BorshDeserialize, BorshSerialize};
use serde::Serialize;

/// Serializes as base58 (canonical Solana pubkey form).
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
pub struct PubkeyBytes(pub [u8; 32]);

impl Serialize for PubkeyBytes {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&bs58::encode(self.0).into_string())
    }
}

/// Serializes as lowercase hex (no `0x` prefix).
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
pub struct Hash32(pub [u8; 32]);

impl Serialize for Hash32 {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let mut out = String::with_capacity(64);
        for b in self.0 {
            use std::fmt::Write;
            let _ = write!(out, "{b:02x}");
        }
        s.serialize_str(&out)
    }
}

/// UTF-8 zero-padded label; serializes as the trimmed string, or hex of the
/// non-NUL prefix if the bytes aren't valid UTF-8.
#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
pub struct NameBytes(pub [u8; 32]);

impl Serialize for NameBytes {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let end = self.0.iter().position(|&b| b == 0).unwrap_or(self.0.len());
        match std::str::from_utf8(&self.0[..end]) {
            Ok(text) => s.serialize_str(text),
            Err(_) => {
                let mut hex = String::with_capacity(end * 2);
                for b in &self.0[..end] {
                    use std::fmt::Write;
                    let _ = write!(hex, "{b:02x}");
                }
                s.serialize_str(&hex)
            }
        }
    }
}
