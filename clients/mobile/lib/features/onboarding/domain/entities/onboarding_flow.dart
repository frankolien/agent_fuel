import 'package:equatable/equatable.dart';

enum AgentFramework { solanaAgentKit, elizaOs, goat, custom }

enum RiskProfile { conservative, balanced, highThroughput, custom }

class OnboardingFlow extends Equatable {
  const OnboardingFlow({
    this.ownerPubkey,
    this.handle = '',
    this.framework = AgentFramework.solanaAgentKit,
    this.depositUsdc = 500,
    this.riskProfile = RiskProfile.balanced,
    this.customMaxPerTxUsdc = 10,
    this.customMaxPerHourUsdc = 100,
  });

  final String? ownerPubkey;
  final String handle;
  final AgentFramework framework;
  final int depositUsdc;
  final RiskProfile riskProfile;
  final double customMaxPerTxUsdc;
  final double customMaxPerHourUsdc;

  bool get walletConnected => ownerPubkey != null;
  bool get handleValid => RegExp(r'^[a-z0-9-]{2,32}$').hasMatch(handle);

  double get effectiveMaxPerTxUsdc => riskProfile == RiskProfile.custom
      ? customMaxPerTxUsdc
      : PolicyPreset.presets[riskProfile]!.maxPerTxUsdc.toDouble();

  double get effectiveMaxPerHourUsdc => riskProfile == RiskProfile.custom
      ? customMaxPerHourUsdc
      : PolicyPreset.presets[riskProfile]!.maxPerHourUsdc.toDouble();

  OnboardingFlow copyWith({
    String? ownerPubkey,
    String? handle,
    AgentFramework? framework,
    int? depositUsdc,
    RiskProfile? riskProfile,
    double? customMaxPerTxUsdc,
    double? customMaxPerHourUsdc,
  }) =>
      OnboardingFlow(
        ownerPubkey: ownerPubkey ?? this.ownerPubkey,
        handle: handle ?? this.handle,
        framework: framework ?? this.framework,
        depositUsdc: depositUsdc ?? this.depositUsdc,
        riskProfile: riskProfile ?? this.riskProfile,
        customMaxPerTxUsdc: customMaxPerTxUsdc ?? this.customMaxPerTxUsdc,
        customMaxPerHourUsdc: customMaxPerHourUsdc ?? this.customMaxPerHourUsdc,
      );

  @override
  List<Object?> get props => [
        ownerPubkey,
        handle,
        framework,
        depositUsdc,
        riskProfile,
        customMaxPerTxUsdc,
        customMaxPerHourUsdc,
      ];
}

class PolicyPreset {
  const PolicyPreset({
    required this.maxPerTxUsdc,
    required this.maxPerHourUsdc,
    required this.title,
    required this.blurb,
  });
  final int maxPerTxUsdc;
  final int maxPerHourUsdc;
  final String title;
  final String blurb;

  static const Map<RiskProfile, PolicyPreset> presets = {
    RiskProfile.conservative: PolicyPreset(
      maxPerTxUsdc: 5,
      maxPerHourUsdc: 60,
      title: 'Conservative',
      blurb: 'Tight caps. Best for a brand-new agent building reputation.',
    ),
    RiskProfile.balanced: PolicyPreset(
      maxPerTxUsdc: 25,
      maxPerHourUsdc: 240,
      title: 'Balanced',
      blurb: 'Sensible limits for an active agent with steady volume.',
    ),
    RiskProfile.highThroughput: PolicyPreset(
      maxPerTxUsdc: 100,
      maxPerHourUsdc: 1200,
      title: 'High throughput',
      blurb: 'Generous caps for market-makers and settlement bots.',
    ),
    RiskProfile.custom: PolicyPreset(
      maxPerTxUsdc: 0,
      maxPerHourUsdc: 0,
      title: 'Custom',
      blurb: 'Set your own per-tx and hourly limits.',
    ),
  };
}

extension AgentFrameworkLabel on AgentFramework {
  String get label {
    switch (this) {
      case AgentFramework.solanaAgentKit:
        return 'Solana Agent Kit';
      case AgentFramework.elizaOs:
        return 'ElizaOS';
      case AgentFramework.goat:
        return 'GOAT';
      case AgentFramework.custom:
        return 'Custom';
    }
  }
}
