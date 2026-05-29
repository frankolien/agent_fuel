enum ActivityKind { spend, deposit, score, freeze, claim }

class ActivityEvent {
  ActivityEvent({
    required this.id,
    required this.kind,
    required this.agentPubkey,
    required this.at,
    this.amountUsdcMicro,
    this.scoreDelta,
    this.service,
    this.signature,
  });

  final String id;
  final ActivityKind kind;
  final String agentPubkey;
  final DateTime at;
  final int? amountUsdcMicro;
  final int? scoreDelta;
  final String? service;
  final String? signature;

  double? get amountUsdc =>
      amountUsdcMicro == null ? null : amountUsdcMicro! / 1000000;
}
