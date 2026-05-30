import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/error/exceptions.dart';
import '../../../agents/domain/usecases/provision_agent.dart';
import '../../../auth/data/datasources/biometric_service.dart';
import '../../../auth/domain/usecases/sign_in_with_solana.dart';
import '../../../fleet/data/repositories/fleet_repository.dart';
import '../../../wallet/data/datasources/wallet_balance_service.dart';
import '../../../wallet/data/repositories/wallet_repository.dart';
import '../../../wallet/domain/entities/connected_wallet.dart';
import '../../domain/entities/onboarding_flow.dart';
import 'onboarding_event.dart';
import 'onboarding_state.dart';

class OnboardingBloc extends Bloc<OnboardingEvent, OnboardingState> {
  OnboardingBloc(
    this._wallet,
    this._signIn,
    this._balance,
    this._fleet,
    this._biometric,
    this._provisionAgent,
  ) : super(const OnboardingWelcome(flow: OnboardingFlow())) {
    on<OnboardingStarted>(_onStarted);
    on<OnboardingNext>(_onNext);
    on<OnboardingBack>(_onBack);
    on<OnboardingSkipped>(_onSkipped);
    on<WalletSignInRequested>(_onSignInRequested);
    on<HandleChanged>(_onHandleChanged);
    on<FrameworkChanged>(_onFrameworkChanged);
    on<DepositChanged>(_onDepositChanged);
    on<RiskProfileChanged>(_onRiskProfileChanged);
    on<CustomMaxPerTxChanged>(_onCustomMaxPerTxChanged);
    on<CustomMaxPerHourChanged>(_onCustomMaxPerHourChanged);
    on<OnboardingAuthorized>(_onAuthorized);
    on<FundBalanceRequested>(_onFundBalanceRequested);
  }

  final WalletRepository _wallet;
  final SignInWithSolana _signIn;
  final WalletBalanceService _balance;
  final FleetRepository _fleet;
  final BiometricService _biometric;
  final ProvisionAgentUseCase _provisionAgent;

  Future<void> _onStarted(
    OnboardingStarted _,
    Emitter<OnboardingState> emit,
  ) async {
    final cached = await _wallet.cachedConnection();
    if (cached == null) return;
    emit(OnboardingWelcome(
      flow: state.flow.copyWith(ownerPubkey: cached.pubkeyBase58),
    ));
  }

  void _onNext(OnboardingNext _, Emitter<OnboardingState> emit) {
    final next = _stateAt(state.step.index + 1);
    emit(next);
    if (next is OnboardingFund) add(const FundBalanceRequested());
  }

  void _onBack(OnboardingBack _, Emitter<OnboardingState> emit) {
    emit(_stateAt(state.step.index - 1));
  }

  Future<void> _onFundBalanceRequested(
    FundBalanceRequested _,
    Emitter<OnboardingState> emit,
  ) async {
    final cur = state;
    if (cur is! OnboardingFund) return;
    final owner = cur.flow.ownerPubkey;
    if (owner == null) return;
    emit(cur.copyWith(loadingBalance: true, balanceError: null));
    try {
      final balance = await _balance.fetch(owner);
      final s = state;
      if (s is! OnboardingFund) return;
      emit(s.copyWith(
        loadingBalance: false,
        usdcBalanceMicro: balance.usdcMicro,
      ));
    } catch (e) {
      final s = state;
      if (s is! OnboardingFund) return;
      emit(s.copyWith(loadingBalance: false, balanceError: e.toString()));
    }
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

      // If the wallet already owns agents on chain, skip the wizard and let
      // the OnboardingPage redirect to Fleet via BlocListener.
      final flow = cur.flow.copyWith(ownerPubkey: wallet.pubkeyBase58);
      if (await _hasExistingAgents(wallet.pubkeyBase58)) {
        emit(OnboardingComplete(flow: flow));
        return;
      }

      emit(OnboardingIdentity(flow: flow, authToken: wallet.authToken));
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

  void _onCustomMaxPerTxChanged(
    CustomMaxPerTxChanged e,
    Emitter<OnboardingState> emit,
  ) {
    final cur = state;
    if (cur is! OnboardingGuardrails) return;
    emit(cur.copyWith(flow: cur.flow.copyWith(customMaxPerTxUsdc: e.usdc)));
  }

  void _onCustomMaxPerHourChanged(
    CustomMaxPerHourChanged e,
    Emitter<OnboardingState> emit,
  ) {
    final cur = state;
    if (cur is! OnboardingGuardrails) return;
    emit(cur.copyWith(flow: cur.flow.copyWith(customMaxPerHourUsdc: e.usdc)));
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
    final approved = await _biometric.authorize(
      'Authorize Agent Fuel to fund and configure your agent',
    );
    if (!approved) {
      emit(OnboardingGuardrails(
        flow: cur.flow,
        authToken: cur.authToken,
        error: 'Biometric cancelled. Tap Authorize again when you\'re ready.',
      ));
      return;
    }

    final owner = cur.flow.ownerPubkey;
    final authToken = cur.authToken;
    if (owner == null || authToken == null) {
      emit(OnboardingGuardrails(
        flow: cur.flow,
        authToken: cur.authToken,
        error: 'Wallet session lost. Go back to the Wallet step and reconnect.',
      ));
      return;
    }

    try {
      await _provisionAgent(
        ownerPubkeyBase58: owner,
        walletAuthToken: authToken,
        handle: cur.flow.handle,
        depositUsdc: cur.flow.depositUsdc,
        perTxLimitUsdc: cur.flow.effectiveMaxPerTxUsdc,
        hourlyLimitUsdc: cur.flow.effectiveMaxPerHourUsdc,
        allowPostPay: false,
      );
      emit(OnboardingSuccess(flow: cur.flow));
    } on WalletException catch (e) {
      emit(OnboardingGuardrails(
        flow: cur.flow,
        authToken: cur.authToken,
        error: e.message,
      ));
    } catch (e) {
      emit(OnboardingGuardrails(
        flow: cur.flow,
        authToken: cur.authToken,
        error: 'Provisioning failed: $e',
      ));
    }
  }

  Future<bool> _hasExistingAgents(String ownerPubkey) async {
    try {
      final agents = await _fleet.listAgents(ownerPubkey: ownerPubkey);
      return agents.isNotEmpty;
    } catch (_) {
      // If the backend can't be reached we'd rather keep the wizard than
      // strand the user — Fleet would just bounce them back anyway.
      return false;
    }
  }

}
