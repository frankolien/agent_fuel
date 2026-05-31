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

  /// Score to render in the UI. Falls back to a local approximation
  /// derived from the on-chain counters when the authoritative score
  /// is 0 but the agent has actually transacted — covers the window
  /// between the first payment and the first ScoreComputed event
  /// (the bot SDK now bundles compute_score into pay() so this gap
  /// only matters for agents using the older pre-bundled flow or for
  /// services that recorded payments without calling compute_score).
  int get liveScore {
    if (score > 0) return score;
    if (totalTransactions == 0) return 0;
    return _approxScoreNoTenure();
  }

  bool get liveScoreIsApproximate => score == 0 && totalTransactions > 0;

  // Mirrors ReputationFactors but skips the tenure component (which
  // needs currentSlot). Approximate scores cap at 850/1000 — close
  // enough for a placeholder until the real ScoreComputed lands.
  int _approxScoreNoTenure() {
    int volume;
    if (totalTransactions == 0) {
      volume = 0;
    } else if (totalTransactions <= 9) {
      volume = 50;
    } else if (totalTransactions <= 99) {
      volume = 125;
    } else {
      volume = 250;
    }
    final diversity = 50 * servicesUsed.clamp(0, 4);
    final streak = 10 * consecutiveSuccess.clamp(0, 15);
    final feedback = totalFeedbackCount == 0
        ? 100
        : (250 - 250 * activeNegativeFeedbackCount.clamp(0, totalFeedbackCount) ~/ totalFeedbackCount)
            .clamp(0, 250);
    return (volume + diversity + streak + feedback).clamp(0, 1000);
  }

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
