import 'package:equatable/equatable.dart';

class Agent extends Equatable {
  const Agent({
    required this.pubkey,
    required this.owner,
    required this.score,
    required this.totalTransactions,
    required this.totalVolumeUsdc,
    required this.servicesUsed,
    required this.consecutiveSuccess,
    required this.totalFeedbackCount,
    required this.activeNegativeFeedbackCount,
    required this.initSlot,
    required this.lastActiveSlot,
    required this.updatedAt,
  });

  factory Agent.fromJson(Map<String, dynamic> json) => Agent(
        pubkey: json['pubkey'] as String,
        owner: json['owner'] as String,
        score: (json['score'] as num).toInt(),
        totalTransactions: (json['total_transactions'] as num).toInt(),
        totalVolumeUsdc: (json['total_volume_usdc'] as num).toInt(),
        servicesUsed: (json['services_used'] as num).toInt(),
        consecutiveSuccess: (json['consecutive_success'] as num).toInt(),
        totalFeedbackCount:
            (json['total_feedback_count'] as num?)?.toInt() ?? 0,
        activeNegativeFeedbackCount:
            (json['active_negative_feedback_count'] as num).toInt(),
        initSlot: (json['init_slot'] as num?)?.toInt() ?? 0,
        lastActiveSlot: (json['last_active_slot'] as num).toInt(),
        updatedAt: DateTime.parse(json['updated_at'] as String),
      );

  final String pubkey;
  final String owner;
  final int score;
  final int totalTransactions;
  final int totalVolumeUsdc;
  final int servicesUsed;
  final int consecutiveSuccess;
  final int totalFeedbackCount;
  final int activeNegativeFeedbackCount;
  final int initSlot;
  final int lastActiveSlot;
  final DateTime updatedAt;

  bool get isScored => score > 0;

  @override
  List<Object?> get props => [
        pubkey,
        owner,
        score,
        totalTransactions,
        totalVolumeUsdc,
        servicesUsed,
        consecutiveSuccess,
        totalFeedbackCount,
        activeNegativeFeedbackCount,
        initSlot,
        lastActiveSlot,
        updatedAt,
      ];
}
