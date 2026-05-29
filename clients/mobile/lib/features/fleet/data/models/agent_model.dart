import '../../domain/entities/agent.dart';

/// Data-layer model — knows how to deserialize the backend wire format.
/// Inherits from `Agent` so it slots straight into the domain layer without
/// an explicit `.toEntity()` mapping step (recommended Reso Coder pattern).
class AgentModel extends Agent {
  const AgentModel({
    required super.pubkey,
    required super.owner,
    required super.score,
    required super.totalTransactions,
    required super.totalVolumeUsdc,
    required super.servicesUsed,
    required super.consecutiveSuccess,
    required super.activeNegativeFeedbackCount,
    required super.lastActiveSlot,
    required super.updatedAt,
  });

  factory AgentModel.fromJson(Map<String, dynamic> json) => AgentModel(
        pubkey: json['pubkey'] as String,
        owner: json['owner'] as String,
        score: (json['score'] as num).toInt(),
        totalTransactions: (json['total_transactions'] as num).toInt(),
        totalVolumeUsdc: (json['total_volume_usdc'] as num).toInt(),
        servicesUsed: (json['services_used'] as num).toInt(),
        consecutiveSuccess: (json['consecutive_success'] as num).toInt(),
        activeNegativeFeedbackCount:
            (json['active_negative_feedback_count'] as num).toInt(),
        lastActiveSlot: (json['last_active_slot'] as num).toInt(),
        updatedAt: DateTime.parse(json['updated_at'] as String),
      );
}
