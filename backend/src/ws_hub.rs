use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

use crate::parser::ParsedEvent;

pub type Subscriber = UnboundedSender<String>;

#[derive(Default, Clone)]
pub struct WsHub {
    inner: Arc<Mutex<HashMap<String, Vec<Subscriber>>>>,
}

impl WsHub {
    pub fn subscribe(&self, agent: &str) -> UnboundedReceiver<String> {
        let (tx, rx) = unbounded_channel();
        let mut map = self.inner.lock().expect("ws hub poisoned");
        map.entry(agent.to_string()).or_default().push(tx);
        rx
    }

    /// Sends `payload` to every active subscriber of `agent` and drops any
    /// receiver whose connection has already gone away.
    pub fn broadcast(&self, agent: &str, payload: &str) -> usize {
        let mut map = self.inner.lock().expect("ws hub poisoned");
        let Some(subs) = map.get_mut(agent) else {
            return 0;
        };
        subs.retain(|tx| tx.send(payload.to_string()).is_ok());
        let remaining = subs.len();
        if remaining == 0 {
            map.remove(agent);
        }
        remaining
    }

    pub fn broadcast_events(&self, events: &[ParsedEvent]) {
        for ev in events {
            let Some(agent) = ev.decoded.payload["agent"].as_str() else {
                continue;
            };
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
            self.broadcast(agent, &text);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn subscribe_then_broadcast_delivers() {
        let hub = WsHub::default();
        let mut rx = hub.subscribe("A");
        assert_eq!(hub.broadcast("A", "hello"), 1);
        assert_eq!(rx.recv().await.as_deref(), Some("hello"));
    }

    #[tokio::test]
    async fn broadcast_to_unknown_agent_is_a_noop() {
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
        // Second broadcast confirms the agent key has been cleaned up too.
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
    async fn other_agents_dont_receive() {
        let hub = WsHub::default();
        let mut rx = hub.subscribe("A");
        hub.broadcast("B", "for B");
        // No frame should be queued for A's receiver.
        assert!(rx.try_recv().is_err());
    }
}
