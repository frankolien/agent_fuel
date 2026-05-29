import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/error/exceptions.dart';
import '../../../auth/domain/usecases/sign_in_with_solana.dart';
import '../../../wallet/data/repositories/wallet_repository.dart';
import '../../../wallet/domain/entities/connected_wallet.dart';
import '../../domain/entities/onboarding_flow.dart';
import 'onboarding_event.dart';
import 'onboarding_state.dart';

class OnboardingBloc extends Bloc<OnboardingEvent, OnboardingState> {
  OnboardingBloc(this._wallet, this._signIn)
      : super(const OnboardingWelcome(flow: OnboardingFlow())) {
    on<OnboardingStarted>(_onStarted);
    on<OnboardingNext>(_onNext);
    on<OnboardingBack>(_onBack);
    on<OnboardingSkipped>(_onSkipped);
    on<WalletSignInRequested>(_onSignInRequested);
    on<HandleChanged>(_onHandleChanged);
    on<FrameworkChanged>(_onFrameworkChanged);
    on<DepositChanged>(_onDepositChanged);
    on<RiskProfileChanged>(_onRiskProfileChanged);
    on<OnboardingAuthorized>(_onAuthorized);
  }

  final WalletRepository _wallet;
  final SignInWithSolana _signIn;

  Future<void> _onStarted(
    OnboardingStarted _,
    Emitter<OnboardingState> emit,
  ) async {
    final cached = await _wallet.cachedConnection();
    if (cached != null) {
      emit(OnboardingWelcome(
        flow: state.flow.copyWith(ownerPubkey: cached.pubkeyBase58),
      ));
    }
  }

  void _onNext(OnboardingNext _, Emitter<OnboardingState> emit) {
    emit(_stateAt(state.step.index + 1));
  }

  void _onBack(OnboardingBack _, Emitter<OnboardingState> emit) {
    emit(_stateAt(state.step.index - 1));
  }

  void _onSkipped(OnboardingSkipped _, Emitter<OnboardingState> emit) {
    emit(OnboardingSuccess(flow: state.flow));
  }

  OnboardingState _stateAt(int index) {
    final clamped = index.clamp(0, OnboardingStep.values.length - 1);
    final flow = state.flow;
    final token = _currentAuthToken();
    switch (OnboardingStep.values[clamped]) {
      case OnboardingStep.welcome:
        return OnboardingWelcome(flow: flow);
      case OnboardingStep.wallet:
        return OnboardingWallet(flow: flow, authToken: token);
      case OnboardingStep.identity:
        return OnboardingIdentity(flow: flow, authToken: token);
      case OnboardingStep.fund:
        return OnboardingFund(flow: flow, authToken: token);
      case OnboardingStep.guardrails:
        return OnboardingGuardrails(flow: flow, authToken: token);
      case OnboardingStep.success:
        return OnboardingSuccess(flow: flow);
    }
  }

  String? _currentAuthToken() {
    final s = state;
    if (s is OnboardingWallet) return s.authToken;
    if (s is OnboardingIdentity) return s.authToken;
    if (s is OnboardingFund) return s.authToken;
    if (s is OnboardingGuardrails) return s.authToken;
    return null;
  }

  Future<void> _onSignInRequested(
    WalletSignInRequested _,
    Emitter<OnboardingState> emit,
  ) async {
    final cur = state;
    if (cur is! OnboardingWallet) return;
    emit(OnboardingWallet(flow: cur.flow, busy: true, authToken: cur.authToken));

    try {
      // Reuse this session's MWA authorization if we already have it — a
      // retry after a failed sign-message shouldn't re-prompt connect.
      final ConnectedWallet wallet = (cur.authToken != null && cur.flow.ownerPubkey != null)
          ? ConnectedWallet(
              pubkeyBase58: cur.flow.ownerPubkey!,
              authToken: cur.authToken!,
            )
          : await _wallet.connect();

      await _signIn(
        pubkeyBase58: wallet.pubkeyBase58,
        walletAuthToken: wallet.authToken,
      );

      emit(OnboardingIdentity(
        flow: cur.flow.copyWith(ownerPubkey: wallet.pubkeyBase58),
        authToken: wallet.authToken,
      ));
    } on WalletException catch (e) {
      emit(OnboardingWallet(
        flow: cur.flow,
        error: e.message,
        authToken: cur.authToken,
      ));
    } on ServerException catch (e) {
      emit(OnboardingWallet(
        flow: cur.flow,
        error: e.message,
        authToken: cur.authToken,
      ));
    } on NetworkException catch (e) {
      emit(OnboardingWallet(
        flow: cur.flow,
        error: e.message,
        authToken: cur.authToken,
      ));
    }
  }

  void _onHandleChanged(HandleChanged e, Emitter<OnboardingState> emit) {
    final cur = state;
    if (cur is! OnboardingIdentity) return;
    emit(cur.copyWith(flow: cur.flow.copyWith(handle: e.handle)));
  }

  void _onFrameworkChanged(FrameworkChanged e, Emitter<OnboardingState> emit) {
    final cur = state;
    if (cur is! OnboardingIdentity) return;
    emit(cur.copyWith(flow: cur.flow.copyWith(framework: e.framework)));
  }

  void _onDepositChanged(DepositChanged e, Emitter<OnboardingState> emit) {
    final cur = state;
    if (cur is! OnboardingFund) return;
    emit(cur.copyWith(flow: cur.flow.copyWith(depositUsdc: e.usdc)));
  }

  void _onRiskProfileChanged(
    RiskProfileChanged e,
    Emitter<OnboardingState> emit,
  ) {
    final cur = state;
    if (cur is! OnboardingGuardrails) return;
    emit(cur.copyWith(flow: cur.flow.copyWith(riskProfile: e.profile)));
  }

  Future<void> _onAuthorized(
    OnboardingAuthorized _,
    Emitter<OnboardingState> emit,
  ) async {
    final cur = state;
    if (cur is! OnboardingGuardrails) return;
    emit(OnboardingGuardrails(
      flow: cur.flow,
      submitting: true,
      authToken: cur.authToken,
    ));
    await Future<void>.delayed(const Duration(milliseconds: 600));
    emit(OnboardingSuccess(flow: cur.flow));
  }
}
