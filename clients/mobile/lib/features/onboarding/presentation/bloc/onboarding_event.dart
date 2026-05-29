import 'package:equatable/equatable.dart';

import '../../domain/entities/onboarding_flow.dart';

abstract class OnboardingEvent extends Equatable {
  const OnboardingEvent();
  @override
  List<Object?> get props => const [];
}

/// Fired once on page mount — restores any cached wallet auth token.
class OnboardingStarted extends OnboardingEvent {
  const OnboardingStarted();
}

class OnboardingNext extends OnboardingEvent {
  const OnboardingNext();
}

class OnboardingBack extends OnboardingEvent {
  const OnboardingBack();
}

class OnboardingSkipped extends OnboardingEvent {
  const OnboardingSkipped();
}

/// Tap "Connect wallet" — kicks off the MWA authorize flow. Android shows
/// its chooser, the user picks a wallet, the wallet returns an auth token.
class WalletConnectRequested extends OnboardingEvent {
  const WalletConnectRequested();
}

class WalletDisconnectRequested extends OnboardingEvent {
  const WalletDisconnectRequested();
}

class HandleChanged extends OnboardingEvent {
  const HandleChanged(this.handle);
  final String handle;
  @override
  List<Object?> get props => [handle];
}

class FrameworkChanged extends OnboardingEvent {
  const FrameworkChanged(this.framework);
  final AgentFramework framework;
  @override
  List<Object?> get props => [framework];
}

class DepositChanged extends OnboardingEvent {
  const DepositChanged(this.usdc);
  final int usdc;
  @override
  List<Object?> get props => [usdc];
}

class RiskProfileChanged extends OnboardingEvent {
  const RiskProfileChanged(this.profile);
  final RiskProfile profile;
  @override
  List<Object?> get props => [profile];
}

/// Final authorize on the guardrails step: biometric prompt → deposit() →
/// update_policy() → initialize_agent() → success.
class OnboardingAuthorized extends OnboardingEvent {
  const OnboardingAuthorized();
}
