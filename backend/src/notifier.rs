use async_trait::async_trait;
use serde::Serialize;

/// One push-notification payload, identified by the owner wallet that
/// should receive it. The dispatcher translates this into platform
/// payloads (FCM, APNs, etc.) per-device.
#[derive(Debug, Clone, Serialize)]
pub struct Alert {
    pub owner: String,
    pub kind: AlertKind,
    pub severity: AlertSeverity,
    pub title: String,
    pub body: String,
    pub data: serde_json::Value,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AlertKind {
    BudgetThreshold,
    ScoreChange,
    TierCrossed,
    VaultFunded,
    VaultFrozen,
    ApprovalRequired,
    ApprovalApproved,
    ApprovalRejected,
}

impl AlertKind {
    pub fn as_str(self) -> &'static str {
        match self {
            AlertKind::BudgetThreshold => "budget_threshold",
            AlertKind::ScoreChange => "score_change",
            AlertKind::TierCrossed => "tier_crossed",
            AlertKind::VaultFunded => "vault_funded",
            AlertKind::VaultFrozen => "vault_frozen",
            AlertKind::ApprovalRequired => "approval_required",
            AlertKind::ApprovalApproved => "approval_approved",
            AlertKind::ApprovalRejected => "approval_rejected",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AlertSeverity {
    Urgent,
    Info,
}

impl AlertSeverity {
    pub fn as_str(self) -> &'static str {
        match self {
            AlertSeverity::Urgent => "urgent",
            AlertSeverity::Info => "info",
        }
    }
}

#[async_trait]
pub trait Notifier: Send + Sync + 'static {
    async fn dispatch(&self, alert: &Alert);
}

/// Fallback notifier. Logs the alert at INFO level. Active whenever
/// `FCM_SERVICE_ACCOUNT_PATH` / `FCM_SERVICE_ACCOUNT_B64` is unset, or
/// when the service-account JSON fails to parse — alerts are still
/// observable in backend logs even with no device pushes.
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
