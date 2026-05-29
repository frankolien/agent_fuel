import 'package:equatable/equatable.dart';

/// Pure domain entity. No JSON parsing here — that's the data layer's job.
class Agent extends Equatable {
  const Agent({
    required this.pubkey,
    required this.owner,
    required this.score,
    required this.totalTransactions,
    required this.totalVolumeUsdc,
    required this.servicesUsed,
    required this.consecutiveSuccess,
    required this.activeNegativeFeedbackCount,
    required this.lastActiveSlot,
    required this.updatedAt,
  });

  final String pubkey;
  final String owner;
  final int score;
  final int totalTransactions;
  final int totalVolumeUsdc;
  final int servicesUsed;
  final int consecutiveSuccess;
  final int activeNegativeFeedbackCount;
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
        activeNegativeFeedbackCount,
        lastActiveSlot,
        updatedAt,
      ];
}
