import 'package:equatable/equatable.dart';

import '../../domain/entities/onboarding_flow.dart';

abstract class OnboardingEvent extends Equatable {
  const OnboardingEvent();
  @override
  List<Object?> get props => const [];
}

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

class WalletSignInRequested extends OnboardingEvent {
  const WalletSignInRequested();
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

class CustomMaxPerTxChanged extends OnboardingEvent {
  const CustomMaxPerTxChanged(this.usdc);
  final double usdc;
  @override
  List<Object?> get props => [usdc];
}

class CustomMaxPerHourChanged extends OnboardingEvent {
  const CustomMaxPerHourChanged(this.usdc);
  final double usdc;
  @override
  List<Object?> get props => [usdc];
}

class OnboardingAuthorized extends OnboardingEvent {
  const OnboardingAuthorized();
}

class FundBalanceRequested extends OnboardingEvent {
  const FundBalanceRequested();
}
