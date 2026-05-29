import 'package:equatable/equatable.dart';

import '../../domain/entities/onboarding_flow.dart';

enum OnboardingStep {
  welcome,
  wallet,
  identity,
  fund,
  guardrails,
  success,
}

abstract class OnboardingState extends Equatable {
  const OnboardingState({required this.flow});
  final OnboardingFlow flow;

  OnboardingStep get step;

  bool get hasBack => step.index > 0 && step != OnboardingStep.success;
  bool get hasSkip => step != OnboardingStep.success;
  int get progressIndex => (step.index + 1).clamp(1, 6);

  @override
  List<Object?> get props => [flow, step];
}

class OnboardingWelcome extends OnboardingState {
  const OnboardingWelcome({required super.flow});

  @override
  OnboardingStep get step => OnboardingStep.welcome;
}

class OnboardingWallet extends OnboardingState {
  const OnboardingWallet({
    required super.flow,
    this.busy = false,
    this.error,
    this.authToken,
  });

  final bool busy;
  final String? error;
  final String? authToken;

  @override
  OnboardingStep get step => OnboardingStep.wallet;

  @override
  List<Object?> get props => [flow, busy, error, authToken];
}

class OnboardingIdentity extends OnboardingState {
  const OnboardingIdentity({required super.flow, this.authToken});
  final String? authToken;

  @override
  OnboardingStep get step => OnboardingStep.identity;

  OnboardingIdentity copyWith({OnboardingFlow? flow}) =>
      OnboardingIdentity(flow: flow ?? this.flow, authToken: authToken);

  @override
  List<Object?> get props => [flow, authToken];
}

class OnboardingFund extends OnboardingState {
  const OnboardingFund({required super.flow, this.authToken});
  final String? authToken;

  @override
  OnboardingStep get step => OnboardingStep.fund;

  OnboardingFund copyWith({OnboardingFlow? flow}) =>
      OnboardingFund(flow: flow ?? this.flow, authToken: authToken);

  @override
  List<Object?> get props => [flow, authToken];
}

class OnboardingGuardrails extends OnboardingState {
  const OnboardingGuardrails({
    required super.flow,
    this.submitting = false,
    this.error,
    this.authToken,
  });

  final bool submitting;
  final String? error;
  final String? authToken;

  @override
  OnboardingStep get step => OnboardingStep.guardrails;

  OnboardingGuardrails copyWith({OnboardingFlow? flow}) => OnboardingGuardrails(
        flow: flow ?? this.flow,
        submitting: submitting,
        error: error,
        authToken: authToken,
      );

  @override
  List<Object?> get props => [flow, submitting, error, authToken];
}

class OnboardingSuccess extends OnboardingState {
  const OnboardingSuccess({required super.flow});

  @override
  OnboardingStep get step => OnboardingStep.success;
}
