use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tokio::sync::mpsc::{channel, Receiver, Sender};

use crate::parser::ParsedEvent;

/// Per-subscriber buffer. Big enough to absorb normal jitter (a couple of
/// seconds of typical event rate); small enough that 1000 concurrent
/// subscribers cap memory at ~64 MB worst case. A subscriber that can't keep
/// up gets dropped (see `broadcast`) — better to force a reconnect than to
/// pile messages indefinitely.
const WS_CHANNEL_CAPACITY: usize = 256;

pub type Subscriber = Sender<String>;

#[derive(Default, Clone)]
pub struct WsHub {
    inner: Arc<Mutex<HashMap<String, Vec<Subscriber>>>>,
}

impl WsHub {
    pub fn subscribe(&self, agent: &str) -> Receiver<String> {
        let (tx, rx) = channel(WS_CHANNEL_CAPACITY);
        let mut map = self.inner.lock().expect("ws hub poisoned");
        map.entry(agent.to_string()).or_default().push(tx);
        rx
    }

    /// Sends `payload` to every active subscriber of `agent` via `try_send`
    /// (never blocks the broadcast worker). Drops any subscriber whose
    /// channel is full (slow consumer) or already closed (receiver gone) —
    /// when the sender is dropped, the receiver task's next `recv()` returns
    /// `None`, the WS loop in `routes::ws` breaks, and the WebSocket closes,
    /// nudging the client to reconnect.
    pub fn broadcast(&self, agent: &str, payload: &str) -> usize {
        let mut map = self.inner.lock().expect("ws hub poisoned");
        let Some(subs) = map.get_mut(agent) else {
            return 0;
        };
        let mut dropped = 0usize;
        subs.retain(|tx| {
            if tx.try_send(payload.to_string()).is_ok() {
                true
            } else {
                dropped += 1;
                false
            }
        });
        if dropped > 0 {
            tracing::warn!(
                agent,
                dropped,
                remaining = subs.len(),
                "ws subscriber dropped (channel full or closed)"
            );
        }
        let remaining = subs.len();
        if remaining == 0 {
            map.remove(agent);
        }
        remaining
    }

    /// Fans each event out to every entity-scoped channel it mentions.
    ///
    /// Channel keys are namespaced (`agent:{pk}`, `vault:{pk}`, `service:{pk}`)
    /// so subscribers on `/ws/agents/{pk}` only receive events that mention
    /// that agent — not anyone else's. The previous implementation broadcast
    /// only on `payload.agent` which silently dropped vault- and service-only
    /// events (Deposited, Claimed, Frozen, PolicyUpdated, ServiceRegistered,
    /// ServiceActiveSet, etc.) — the screens listening for them never saw
    /// anything.
    pub fn broadcast_events(&self, events: &[ParsedEvent]) {
        for ev in events {
            let frame = serde_json::json!({
                "type": "event",
                "signature": ev.signature,
                "log_index": ev.log_index,
                "slot": ev.slot,
                "program_id": ev.program_id,
                "event_name": ev.decoded.event_name,
                "payload": ev.decoded.payload,
            });
            let Ok(text) = serde_json::to_string(&frame) else {
                continue;
            };
            for key in event_channels(&ev.decoded.payload) {
                self.broadcast(&key, &text);
            }
        }
    }
}

/// Returns every channel an event payload should be broadcast on. An event
/// like `Spent` carries `agent`, `vault`, and `service` — subscribers on any
/// of those three channels see the same frame.
fn event_channels(payload: &serde_json::Value) -> Vec<String> {
    const ENTITY_FIELDS: &[(&str, &str)] = &[
        ("agent", "agent"),
        ("vault", "vault"),
        ("service", "service"),
    ];
    ENTITY_FIELDS
        .iter()
        .filter_map(|(field, kind)| {
            payload[*field]
                .as_str()
                .map(|pk| format!("{kind}:{pk}"))
        })
        .collect()
}

/// Channel-key helpers used by the WS route handlers — keep keys in one
/// place so the subscribe path and the broadcast path can't drift.
pub fn agent_key(pubkey: &str) -> String {
    format!("agent:{pubkey}")
}

pub fn vault_key(pubkey: &str) -> String {
    format!("vault:{pubkey}")
}

pub fn service_key(pubkey: &str) -> String {
    format!("service:{pubkey}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn subscribe_then_broadcast_delivers() {
        let hub = WsHub::default();
        let mut rx = hub.subscribe("A");
        assert_eq!(hub.broadcast("A", "hello"), 1);
        assert_eq!(rx.recv().await.as_deref(), Some("hello"));
    }

    #[tokio::test]
    async fn broadcast_to_unknown_key_is_a_noop() {
        let hub = WsHub::default();
        assert_eq!(hub.broadcast("nobody", "x"), 0);
    }

    #[tokio::test]
    async fn dropped_subscriber_is_evicted_on_next_broadcast() {
        let hub = WsHub::default();
        let rx = hub.subscribe("A");
        drop(rx);
        // First broadcast detects the dead sender via `send` returning Err,
        // then `retain` removes it. Result: 0 live subscribers.
        assert_eq!(hub.broadcast("A", "msg"), 0);
        // Second broadcast confirms the key has been cleaned up too.
        assert_eq!(hub.broadcast("A", "again"), 0);
    }

    #[tokio::test]
    async fn multiple_subscribers_each_receive_a_copy() {
        let hub = WsHub::default();
        let mut a = hub.subscribe("X");
        let mut b = hub.subscribe("X");
        assert_eq!(hub.broadcast("X", "ping"), 2);
        assert_eq!(a.recv().await.as_deref(), Some("ping"));
        assert_eq!(b.recv().await.as_deref(), Some("ping"));
    }

    #[tokio::test]
    async fn other_keys_dont_receive() {
        let hub = WsHub::default();
        let mut rx = hub.subscribe("A");
        hub.broadcast("B", "for B");
        // No frame should be queued for A's receiver.
        assert!(rx.try_recv().is_err());
    }

    #[tokio::test]
    async fn slow_subscriber_is_dropped_when_channel_fills() {
        // Subscriber never reads. After filling the channel, the next
        // broadcast should drop them and report 0 live subscribers.
        let hub = WsHub::default();
        let _rx_held = hub.subscribe("A");
        for _ in 0..WS_CHANNEL_CAPACITY {
            assert_eq!(hub.broadcast("A", "x"), 1);
        }
        // Channel is now full. The next broadcast's try_send fails → subscriber dropped.
        assert_eq!(hub.broadcast("A", "overflow"), 0);
        // Subsequent broadcasts are no-ops; the key is also cleaned up.
        assert_eq!(hub.broadcast("A", "again"), 0);
    }

    #[test]
    fn event_channels_collects_every_entity_in_payload() {
        // A Spent event carries agent + vault + service simultaneously.
        let p = json!({ "agent": "A", "vault": "V", "service": "S", "amount_usdc": 1 });
        let keys = event_channels(&p);
        assert!(keys.iter().any(|k| k == "agent:A"));
        assert!(keys.iter().any(|k| k == "vault:V"));
        assert!(keys.iter().any(|k| k == "service:S"));
    }

    #[test]
    fn event_channels_handles_vault_only_payload() {
        // Regression for the bug where vault-only events (Deposited, Claimed,
        // VaultFrozen, PolicyUpdated, Withdrawn, Unfrozen) silently dropped
        // because the old broadcaster only looked at `payload.agent`.
        let p = json!({ "vault": "V", "amount_usdc": 1 });
        let keys = event_channels(&p);
        assert_eq!(keys, vec!["vault:V"]);
    }

    #[test]
    fn event_channels_handles_service_only_payload() {
        let p = json!({ "service": "S", "active": false });
        let keys = event_channels(&p);
        assert_eq!(keys, vec!["service:S"]);
    }

    #[test]
    fn event_channels_returns_empty_for_payload_without_entities() {
        // Defensive: a payload missing every known entity field should yield
        // zero broadcasts rather than panic.
        let p = json!({ "amount_usdc": 1 });
        assert!(event_channels(&p).is_empty());
    }

    #[test]
    fn keys_use_their_namespace_prefixes() {
        assert_eq!(agent_key("abc"), "agent:abc");
        assert_eq!(vault_key("abc"), "vault:abc");
        assert_eq!(service_key("abc"), "service:abc");
    }
}
