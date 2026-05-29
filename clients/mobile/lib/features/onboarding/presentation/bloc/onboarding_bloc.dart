import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/usecase/usecase.dart';
import '../../../wallet/domain/repositories/wallet_repository.dart';
import '../../../wallet/domain/usecases/connect_wallet.dart';
import '../../domain/entities/onboarding_flow.dart';
import 'onboarding_event.dart';
import 'onboarding_state.dart';

/// Drives the 6-step onboarding wizard. Each step is its own state class
/// (Solflare-style); the bloc transitions between them as the user advances.
///
/// Side effects still stubbed for 4.1a:
///   - Final deposit / update_policy / initialize_agent on guardrails step.
/// Wallet connect is real (Mobile Wallet Adapter on Android).
class OnboardingBloc extends Bloc<OnboardingEvent, OnboardingState> {
  OnboardingBloc(this._connectWallet, this._walletRepository)
      : super(const OnboardingWelcome(flow: OnboardingFlow())) {
    on<OnboardingStarted>(_onStarted);
    on<OnboardingNext>(_onNext);
    on<OnboardingBack>(_onBack);
    on<OnboardingSkipped>(_onSkipped);
    on<WalletConnectRequested>(_onConnectRequested);
    on<WalletDisconnectRequested>(_onDisconnectRequested);
    on<HandleChanged>(_onHandleChanged);
    on<FrameworkChanged>(_onFrameworkChanged);
    on<DepositChanged>(_onDepositChanged);
    on<RiskProfileChanged>(_onRiskProfileChanged);
    on<OnboardingAuthorized>(_onAuthorized);
  }

  final ConnectWallet _connectWallet;
  final WalletRepository _walletRepository;

  // ── Wizard navigation ────────────────────────────────────────────────────

  Future<void> _onStarted(
    OnboardingStarted _,
    Emitter<OnboardingState> emit,
  ) async {
    final cached = await _walletRepository.cachedConnection();
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

  /// Build the state variant for a given step index, carrying the current
  /// flow + auth token through. Used by Next/Back so we don't have to
  /// branch over every (from, to) pair.
  OnboardingState _stateAt(int index) {
    final clamped = index.clamp(0, OnboardingStep.values.length - 1);
    final next = OnboardingStep.values[clamped];
    final flow = state.flow;
    final token = _currentAuthToken();
    switch (next) {
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

  // ── Wallet ───────────────────────────────────────────────────────────────

  Future<void> _onConnectRequested(
    WalletConnectRequested _,
    Emitter<OnboardingState> emit,
  ) async {
    final cur = state;
    if (cur is! OnboardingWallet) return;
    emit(cur.copyWith(connecting: true, error: null));
    final result = await _connectWallet(const NoParams());
    result.fold(
      (failure) => emit(cur.copyWith(connecting: false, error: failure.message)),
      (wallet) => emit(OnboardingWallet(
        flow: cur.flow.copyWith(ownerPubkey: wallet.pubkeyBase58),
        connecting: false,
        authToken: wallet.authToken,
      )),
    );
  }

  Future<void> _onDisconnectRequested(
    WalletDisconnectRequested _,
    Emitter<OnboardingState> emit,
  ) async {
    final cur = state;
    if (cur is! OnboardingWallet) return;
    final token = cur.authToken;
    if (token != null) {
      await _walletRepository.disconnect(token);
    }
    emit(OnboardingWallet(flow: cur.flow.disconnect()));
  }

  // ── Field edits — keep within the current step variant ──────────────────

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

  // ── Final authorize on the guardrails step ──────────────────────────────

  Future<void> _onAuthorized(
    OnboardingAuthorized _,
    Emitter<OnboardingState> emit,
  ) async {
    final cur = state;
    if (cur is! OnboardingGuardrails) return;
    emit(cur.copyWith(submitting: true));
    // 4.1c will: local_auth biometric prompt → deposit() → update_policy()
    // → initialize_agent() → emit success.
    await Future<void>.delayed(const Duration(milliseconds: 600));
    emit(OnboardingSuccess(flow: cur.flow));
  }
}
