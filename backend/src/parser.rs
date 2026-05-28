use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde_json::Value;

use crate::events::{self, DecodedEvent};

pub struct ParsedEvent {
    pub signature: String,
    pub slot: i64,
    pub log_index: i32,
    pub program_id: String,
    pub decoded: DecodedEvent,
}

#[derive(Debug, thiserror::Error)]
pub enum ParseError {
    #[error("payload is not valid JSON")]
    Json(#[from] serde_json::Error),
    #[error("payload root must be a JSON object or array of objects")]
    UnexpectedRoot,
}

pub fn parse(body: &[u8]) -> Result<Vec<ParsedEvent>, ParseError> {
    let root: Value = serde_json::from_slice(body)?;
    let txs: &[Value] = match &root {
        Value::Array(a) => a.as_slice(),
        Value::Object(_) => std::slice::from_ref(&root),
        _ => return Err(ParseError::UnexpectedRoot),
    };

    let mut out = Vec::new();
    for tx in txs {
        parse_one(tx, &mut out);
    }
    Ok(out)
}

fn parse_one(tx: &Value, out: &mut Vec<ParsedEvent>) {
    // Helius "raw" webhooks deliver the full `getTransaction` shape — signature
    // lives at `transaction.signatures[0]`. Enhanced and some custom shapes
    // surface it as a flat `signature` string. Accept either.
    let signature = tx
        .get("signature")
        .and_then(|v| v.as_str())
        .map(str::to_owned)
        .or_else(|| {
            tx.pointer("/transaction/signatures/0")
                .and_then(|v| v.as_str())
                .map(str::to_owned)
        })
        .unwrap_or_default();
    if signature.is_empty() {
        return;
    }
    let slot = tx.get("slot").and_then(|v| v.as_i64()).unwrap_or(0);

    // `meta.logMessages` is the raw shape; `transaction.meta.logMessages` is
    // the enhanced/nested shape.
    let logs = tx
        .pointer("/meta/logMessages")
        .or_else(|| tx.pointer("/transaction/meta/logMessages"))
        .and_then(|v| v.as_array());
    let Some(logs) = logs else {
        tracing::debug!(%signature, "skipping tx without logMessages");
        return;
    };

    let mut stack: Vec<String> = Vec::new();
    let mut log_index: i32 = 0;
    for line in logs.iter().filter_map(|v| v.as_str()) {
        if let Some(program) = parse_invoke(line) {
            stack.push(program);
            continue;
        }
        if parse_terminator(line) {
            stack.pop();
            continue;
        }
        let Some(b64) = line.strip_prefix("Program data: ") else {
            continue;
        };
        let Some(program_id) = stack.last() else {
            continue;
        };

        let raw = match STANDARD.decode(b64.trim()) {
            Ok(r) => r,
            Err(err) => {
                tracing::warn!(%signature, %err, "skipping log line: bad base64");
                continue;
            }
        };
        match events::decode(&raw) {
            Ok(Some(decoded)) => {
                out.push(ParsedEvent {
                    signature: signature.clone(),
                    slot,
                    log_index,
                    program_id: program_id.clone(),
                    decoded,
                });
                log_index += 1;
            }
            Ok(None) => {}
            Err(err) => {
                tracing::warn!(%signature, %err, "skipping log line: decode failed");
            }
        }
    }
}

fn parse_invoke(line: &str) -> Option<String> {
    let rest = line.strip_prefix("Program ")?;
    let (program, after) = rest.split_once(' ')?;
    after.starts_with("invoke ").then(|| program.to_owned())
}

fn parse_terminator(line: &str) -> bool {
    let Some(rest) = line.strip_prefix("Program ") else {
        return false;
    };
    let Some((_, after)) = rest.split_once(' ') else {
        return false;
    };
    after == "success" || after.starts_with("failed:")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::discriminators::EventDescriptor;
    use crate::events::reputation::AgentInitialized;
    use crate::events::types::PubkeyBytes;
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;
    use borsh::BorshSerialize;
    use serde_json::json;

    fn encode_event<T: BorshSerialize + EventDescriptor>(event: &T) -> String {
        let mut bytes = T::discriminator().to_vec();
        event.serialize(&mut bytes).unwrap();
        STANDARD.encode(&bytes)
    }

    #[test]
    fn parser_extracts_anchor_event_from_log_messages() {
        let event = AgentInitialized {
            agent: PubkeyBytes([7u8; 32]),
            owner: PubkeyBytes([8u8; 32]),
            init_slot: 42,
        };
        let b64 = encode_event(&event);
        let payload = json!([{
            "signature": "abc123",
            "slot": 100,
            "meta": {
                "logMessages": [
                    "Program 4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ invoke [1]",
                    "Program log: initialize_agent",
                    format!("Program data: {b64}"),
                    "Program 4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ success"
                ]
            }
        }]);

        let events = parse(payload.to_string().as_bytes()).unwrap();
        assert_eq!(events.len(), 1);
        let ev = &events[0];
        assert_eq!(ev.signature, "abc123");
        assert_eq!(ev.slot, 100);
        assert_eq!(ev.log_index, 0);
        assert_eq!(
            ev.program_id,
            "4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ"
        );
        assert_eq!(ev.decoded.event_name, "AgentInitialized");
        assert_eq!(ev.decoded.payload["init_slot"], 42);
    }

    #[test]
    fn parser_handles_nested_invocation_stack() {
        let event = AgentInitialized {
            agent: PubkeyBytes([1u8; 32]),
            owner: PubkeyBytes([2u8; 32]),
            init_slot: 5,
        };
        let b64 = encode_event(&event);
        let payload = json!([{
            "signature": "sig_nested",
            "slot": 200,
            "meta": {
                "logMessages": [
                    "Program OuterCallerXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX invoke [1]",
                    "Program 4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ invoke [2]",
                    format!("Program data: {b64}"),
                    "Program 4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ success",
                    "Program OuterCallerXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX success"
                ]
            }
        }]);

        let events = parse(payload.to_string().as_bytes()).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(
            events[0].program_id,
            "4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ"
        );
    }

    #[test]
    fn parser_accepts_single_object_not_just_array() {
        let event = AgentInitialized {
            agent: PubkeyBytes([0u8; 32]),
            owner: PubkeyBytes([0u8; 32]),
            init_slot: 1,
        };
        let b64 = encode_event(&event);
        let payload = json!({
            "signature": "single_object",
            "slot": 10,
            "meta": { "logMessages": [
                "Program 4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ invoke [1]",
                format!("Program data: {b64}"),
                "Program 4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ success"
            ] }
        });
        let events = parse(payload.to_string().as_bytes()).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].signature, "single_object");
    }

    #[test]
    fn parser_increments_log_index_for_multiple_events_in_one_tx() {
        let event = AgentInitialized {
            agent: PubkeyBytes([1u8; 32]),
            owner: PubkeyBytes([2u8; 32]),
            init_slot: 1,
        };
        let b64 = encode_event(&event);
        let payload = json!([{
            "signature": "multi",
            "slot": 1,
            "meta": { "logMessages": [
                "Program 4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ invoke [1]",
                format!("Program data: {b64}"),
                format!("Program data: {b64}"),
                "Program 4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ success"
            ] }
        }]);
        let events = parse(payload.to_string().as_bytes()).unwrap();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].log_index, 0);
        assert_eq!(events[1].log_index, 1);
    }

    #[test]
    fn parser_reads_signature_from_helius_raw_shape() {
        // Helius "raw" webhooks deliver the full getTransaction shape: no flat
        // `signature` field, the signature lives at transaction.signatures[0].
        // Regression for the bug where every Helius POST 202'd with zero events
        // parsed because we only checked the top-level field.
        let event = AgentInitialized {
            agent: PubkeyBytes([1u8; 32]),
            owner: PubkeyBytes([2u8; 32]),
            init_slot: 7,
        };
        let b64 = encode_event(&event);
        let payload = json!([{
            "slot": 999,
            "transaction": {
                "signatures": ["from_helius_raw"],
                "message": {}
            },
            "meta": { "logMessages": [
                "Program 4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ invoke [1]",
                format!("Program data: {b64}"),
                "Program 4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ success"
            ] }
        }]);
        let events = parse(payload.to_string().as_bytes()).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].signature, "from_helius_raw");
        assert_eq!(events[0].slot, 999);
    }

    #[test]
    fn parser_skips_tx_with_no_log_messages() {
        let payload = json!([{ "signature": "no_logs", "slot": 1 }]);
        let events = parse(payload.to_string().as_bytes()).unwrap();
        assert!(events.is_empty());
    }

    #[test]
    fn parser_skips_unknown_discriminator_silently() {
        let b64 = STANDARD.encode([0xff; 16]);
        let payload = json!([{
            "signature": "unknown_disc",
            "slot": 1,
            "meta": { "logMessages": [
                "Program 4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ invoke [1]",
                format!("Program data: {b64}"),
                "Program 4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ success"
            ] }
        }]);
        let events = parse(payload.to_string().as_bytes()).unwrap();
        assert!(events.is_empty());
    }

    #[test]
    fn parser_rejects_non_json_body() {
        let result = parse(b"not json");
        assert!(matches!(result, Err(ParseError::Json(_))));
    }

    #[test]
    fn parser_skips_tx_with_blank_signature() {
        let payload = json!([{ "signature": "", "slot": 1, "meta": { "logMessages": [] } }]);
        let events = parse(payload.to_string().as_bytes()).unwrap();
        assert!(events.is_empty());
    }
}
