import 'entities/agent.dart';

/// Score-component breakdown for the reputation factors card. Mirrors
/// programs/reputation/src/instructions/compute_score.rs — the on-chain
/// formula is authoritative. If those weights ever shift, update both
/// places together.
///
/// The on-chain `ScoreComputed` event only emits the final score, so the
/// breakdown is re-derived here from the agent's other on-chain counters.
class ReputationFactors {
  const ReputationFactors({
    required this.volume,
    required this.diversity,
    required this.streak,
    required this.tenure,
    required this.feedback,
    required this.total,
  });

  // Max points each component can contribute. Sum = MAX_SCORE (1000).
  static const int maxVolume = 250;
  static const int maxDiversity = 200;
  static const int maxStreak = 150;
  static const int maxTenure = 150;
  static const int maxFeedback = 250;
  static const int maxTotal = 1000;

  // Bracket constants — kept in sync with compute_score.rs.
  static const int _diversityCap = 4;
  static const int _diversityPerService = 50;
  static const int _streakCap = 15;
  static const int _streakPerSuccess = 10;
  static const int _slotsPerDay = 216000;
  static const int _neutralFeedbackBonus = 100;

  final int volume;
  final int diversity;
  final int streak;
  final int tenure;
  final int feedback;
  final int total;

  static int volumePoints(int totalTransactions) {
    if (totalTransactions == 0) return 0;
    if (totalTransactions <= 9) return 50;
    if (totalTransactions <= 99) return 125;
    return maxVolume;
  }

  static int diversityPoints(int servicesUsed) {
    final n = servicesUsed.clamp(0, _diversityCap);
    return _diversityPerService * n;
  }

  static int streakPoints(int consecutiveSuccess) {
    final n = consecutiveSuccess.clamp(0, _streakCap);
    return _streakPerSuccess * n;
  }

  static int tenurePoints(int firstActiveSlot, int currentSlot) {
    final age = (currentSlot - firstActiveSlot).clamp(0, 1 << 62);
    if (age < _slotsPerDay) return 0;
    if (age < 7 * _slotsPerDay) return 50;
    if (age < 30 * _slotsPerDay) return 100;
    return maxTenure;
  }

  static int feedbackPoints(int total, int activeNegative) {
    if (total == 0) return _neutralFeedbackBonus;
    final neg = activeNegative.clamp(0, total);
    final penalty = maxFeedback * neg ~/ total;
    return (maxFeedback - penalty).clamp(0, maxFeedback);
  }

  factory ReputationFactors.forAgent(Agent a, {required int currentSlot}) {
    final v = volumePoints(a.totalTransactions);
    final d = diversityPoints(a.servicesUsed);
    final s = streakPoints(a.consecutiveSuccess);
    final t = tenurePoints(a.initSlot, currentSlot);
    final f = feedbackPoints(a.totalFeedbackCount, a.activeNegativeFeedbackCount);
    final raw = (v + d + s + t + f).clamp(0, maxTotal);
    return ReputationFactors(
      volume: v,
      diversity: d,
      streak: s,
      tenure: t,
      feedback: f,
      total: raw,
    );
  }
}
