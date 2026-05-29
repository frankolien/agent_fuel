import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:get_it/get_it.dart';

import '../../../../app/router.dart';
import '../bloc/onboarding_bloc.dart';
import '../bloc/onboarding_event.dart';
import '../bloc/onboarding_state.dart';
import 'steps/fund_step.dart';
import 'steps/guardrails_step.dart';
import 'steps/identity_step.dart';
import 'steps/success_step.dart';
import 'steps/wallet_step.dart';
import 'steps/welcome_step.dart';

@RoutePage()
class OnboardingPage extends StatelessWidget {
  const OnboardingPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) =>
          GetIt.I<OnboardingBloc>()..add(const OnboardingStarted()),
      child: BlocListener<OnboardingBloc, OnboardingState>(
        listenWhen: (_, b) => b is OnboardingComplete,
        listener: (ctx, _) =>
            ctx.router.replaceAll([const FleetRoute()]),
        child: BlocBuilder<OnboardingBloc, OnboardingState>(
          buildWhen: (a, b) => a.runtimeType != b.runtimeType,
          builder: (_, state) => AnimatedSwitcher(
            duration: const Duration(milliseconds: 200),
            switchInCurve: Curves.easeOut,
            switchOutCurve: Curves.easeIn,
            child: _pageFor(state),
          ),
        ),
      ),
    );
  }

  Widget _pageFor(OnboardingState state) {
    if (state is OnboardingWelcome) return const WelcomeStep(key: ValueKey('welcome'));
    if (state is OnboardingWallet) return const WalletStep(key: ValueKey('wallet'));
    if (state is OnboardingIdentity) return const IdentityStep(key: ValueKey('identity'));
    if (state is OnboardingFund) return const FundStep(key: ValueKey('fund'));
    if (state is OnboardingGuardrails) return const GuardrailsStep(key: ValueKey('guardrails'));
    if (state is OnboardingSuccess) return const SuccessStep(key: ValueKey('success'));
    // OnboardingComplete renders nothing — the BlocListener replaces the
    // route on the same frame.
    return const SizedBox.shrink();
  }
}
