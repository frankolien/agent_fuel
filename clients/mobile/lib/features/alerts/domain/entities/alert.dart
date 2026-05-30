import 'package:equatable/equatable.dart';

enum AlertKind {
  budgetThreshold,
  scoreChange,
  tierCrossed,
  vaultFunded,
  vaultFrozen,
  approvalRequired,
  approvalApproved,
  approvalRejected,
  unknown,
}

enum AlertSeverity { urgent, info }

class Alert extends Equatable {
  const Alert({
    required this.id,
    required this.owner,
    required this.kind,
    required this.severity,
    required this.title,
    required this.body,
    required this.data,
    required this.createdAt,
    this.readAt,
  });

  factory Alert.fromJson(Map<String, dynamic> json) => Alert(
        id: (json['id'] as num).toInt(),
        owner: json['owner'] as String,
        kind: _parseKind(json['kind'] as String?),
        severity: _parseSeverity(json['severity'] as String?),
        title: json['title'] as String,
        body: json['body'] as String,
        data: (json['data'] as Map?)?.cast<String, dynamic>() ?? const {},
        readAt: json['read_at'] == null
            ? null
            : DateTime.parse(json['read_at'] as String),
        createdAt: DateTime.parse(json['created_at'] as String),
      );

  final int id;
  final String owner;
  final AlertKind kind;
  final AlertSeverity severity;
  final String title;
  final String body;
  final Map<String, dynamic> data;
  final DateTime? readAt;
  final DateTime createdAt;

  bool get isRead => readAt != null;
  bool get isUrgent => severity == AlertSeverity.urgent;
  bool get requiresApproval => kind == AlertKind.approvalRequired;

  int? get pendingSpendId {
    final v = data['pending_spend_id'];
    if (v is num) return v.toInt();
    return null;
  }

  /// On-chain PendingSpend PDA pubkey. Populated when the alert was sourced
  /// from a `SpendRequested` chain event (the only path where mobile can
  /// build approve_spend itself). Null on legacy/off-chain alerts.
  String? get pendingSpendPubkey =>
      data['pending_spend_pubkey'] as String?;

  String? get vaultPubkey => data['vault'] as String?;
  String? get servicePubkey => data['service'] as String?;
  String? get agentPubkey => data['agent'] as String?;

  /// Convenience used by the approve sheet's "to <service>" line.
  String? get serviceLabel => data['service'] as String?;

  double? get amountUsdc {
    final v = data['amount_usdc'];
    if (v is num) return v.toDouble();
    return null;
  }

  Alert markRead() => Alert(
        id: id,
        owner: owner,
        kind: kind,
        severity: severity,
        title: title,
        body: body,
        data: data,
        readAt: readAt ?? DateTime.now(),
        createdAt: createdAt,
      );

  @override
  List<Object?> get props =>
      [id, owner, kind, severity, title, body, data, readAt, createdAt];
}

AlertKind _parseKind(String? raw) {
  switch (raw) {
    case 'budget_threshold':
      return AlertKind.budgetThreshold;
    case 'score_change':
      return AlertKind.scoreChange;
    case 'tier_crossed':
      return AlertKind.tierCrossed;
    case 'vault_funded':
      return AlertKind.vaultFunded;
    case 'vault_frozen':
      return AlertKind.vaultFrozen;
    case 'approval_required':
      return AlertKind.approvalRequired;
    case 'approval_approved':
      return AlertKind.approvalApproved;
    case 'approval_rejected':
      return AlertKind.approvalRejected;
    default:
      return AlertKind.unknown;
  }
}

AlertSeverity _parseSeverity(String? raw) {
  switch (raw) {
    case 'urgent':
      return AlertSeverity.urgent;
    default:
      return AlertSeverity.info;
  }
}
