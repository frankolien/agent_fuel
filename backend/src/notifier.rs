use async_trait::async_trait;
use serde::Serialize;

/// One push-notification payload, identified by the owner wallet that
/// should receive it. The dispatcher translates this into platform
/// payloads (FCM, APNs, etc.) per-device.
#[derive(Debug, Clone, Serialize)]
pub struct Alert {
    pub owner: String,
    pub kind: AlertKind,
    pub title: String,
    pub body: String,
    pub data: serde_json::Value,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AlertKind {
    BudgetThreshold,
    ScoreChange,
}

#[async_trait]
pub trait Notifier: Send + Sync + 'static {
    async fn dispatch(&self, alert: &Alert);
}

/// Dev-default notifier. Logs the alert at INFO level instead of calling
/// FCM. Swapped for a real `FcmNotifier` once `FCM_SERVICE_ACCOUNT_JSON`
/// is provisioned (Phase 3 account checklist).
pub struct LogNotifier;

#[async_trait]
impl Notifier for LogNotifier {
    async fn dispatch(&self, alert: &Alert) {
        tracing::info!(
            owner = %alert.owner,
            kind = ?alert.kind,
            title = %alert.title,
            body = %alert.body,
            data = %alert.data,
            "alert dispatched"
        );
    }
}
