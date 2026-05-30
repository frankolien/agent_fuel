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

/// Dev-default notifier. Logs the alert at INFO level instead of calling
/// FCM.
///
/// **Deployed configuration is log-only in v0.1.** A real `FcmNotifier`
/// implementing this trait slots in once `FCM_SERVICE_ACCOUNT_JSON` is
/// provisioned; until then push notifications are visible only in backend
/// logs, not on the user's device. Tracked in `docs/maintenance.md` and
/// surfaced in `docs/backend-local-dev.md`'s "Known limitations" section.
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
