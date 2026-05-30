import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/error/exceptions.dart';
import '../../../agent_keys/data/datasources/agent_key_store.dart';
import '../../../agent_keys/data/datasources/agent_seed_derivation.dart';
import '../../../auth/data/datasources/biometric_service.dart';
import '../../../auth/domain/usecases/sign_in_with_solana.dart';
import '../../../fleet/data/repositories/fleet_repository.dart';
import '../../../wallet/data/datasources/mwa_datasource.dart';
import '../../../wallet/data/datasources/wallet_balance_service.dart';
import '../../../wallet/data/repositories/wallet_repository.dart';
import '../../../wallet/domain/entities/connected_wallet.dart';
import '../../data/onchain/agent_provisioning_service.dart';
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
    this._mwa,
    this._provisioning,
    this._agentKeys,
    this._derivation,
  ) : super(const OnboardingWelcome(flow: OnboardingFlow())) {
    // Consume — and reset — the global add-mode flag so a stale add-agent
    // entry from a previous wizard run can't suppress the bounce on a
    // genuine restart.
    _addAgentMode = addAgentMode;
    addAgentMode = false;
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
  final MwaDataSource _mwa;
  final AgentProvisioningService _provisioning;
  final AgentKeyStore _agentKeys;
  final AgentSeedDerivation _derivation;

  /// One-shot signal from the Fleet "+ Add agent" entry point — tells the
  /// next bloc instance to run the wizard as an "add agent" flow instead of
  /// bouncing back to Fleet on existing-agent detection. Constructor reads
  /// and clears it so a stale value can't leak across app restarts.
  static bool addAgentMode = false;
  late final bool _addAgentMode;

  Future<void> _onStarted(
    OnboardingStarted _,
    Emitter<OnboardingState> emit,
  ) async {
    final cached = await _wallet.cachedConnection();
    if (cached == null) return;
    // Add-agent shortcut: skip Welcome + Wallet entirely. The user
    // already has a session; they came here to fill the agent details.
    if (_addAgentMode) {
      emit(OnboardingIdentity(
        flow: state.flow.copyWith(ownerPubkey: cached.pubkeyBase58),
        authToken: cached.authToken,
      ));
      return;
    }
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
      // Add-agent shortcut: the user is already signed in (they were on
      // Fleet, which holds a valid JWT and a cached MWA session). Skip both
      // the MWA `connect()` prompt and the SIWS re-sign — just reuse the
      // cached wallet and walk straight into Identity.
      if (_addAgentMode) {
        final cached = await _wallet.cachedConnection();
        if (cached != null) {
          emit(OnboardingIdentity(
            flow: cur.flow.copyWith(ownerPubkey: cached.pubkeyBase58),
            authToken: cached.authToken,
          ));
          return;
        }
        // No cached session — fall through to the normal connect+SIWS path.
      }

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
      // Pick the next wallet-scoped agent index from on-chain truth so two
      // devices don't collide on the same derived seed. We can't rely on
      // any local counter — the user might be onboarding a second agent
      // from a fresh install with N agents already deployed.
      final nextIndex = await _nextAgentIndex(owner);
      final seedBytes = await _derivation.seedForIndex(
        ownerPubkey: owner,
        walletAuthToken: authToken,
        index: nextIndex,
      );
      final plan = await _provisioning.build(
        ownerPubkeyBase58: owner,
        agentHandle: cur.flow.handle,
        depositUsdc: cur.flow.depositUsdc,
        perTxLimitUsdc: cur.flow.effectiveMaxPerTxUsdc,
        hourlyLimitUsdc: cur.flow.effectiveMaxPerHourUsdc,
        lifetimeLimitUsdc: 0.0,
        allowPostPay: false,
        agentSeedBytes: seedBytes,
      );
      await _mwa.signAndSendTransaction(
        authToken: authToken,
        transactionBytes: plan.transactionBytes,
      );
      // Tx confirmed — the agent now exists on chain. Persist its keypair
      // so future spend / request_spend calls (by an agent runtime or by
      // this app) can sign with it. Failures here don't bubble up: the
      // agent is already provisioned, and the user can re-export from the
      // detail page as long as they haven't cleared app storage.
      try {
        await _agentKeys.save(
          agentPubkey: plan.agentPubkey,
          seedBytes: plan.agentSeedBytes,
        );
      } catch (e) {
        // Best effort. If this fails the agent is still on chain and
        // functional — only the recovery path is broken.
        // (No way to surface this without delaying success; logged only.)
        // ignore: avoid_print
        print('agent key persist failed: $e');
      }
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

  Future<int> _nextAgentIndex(String ownerPubkey) async {
    try {
      final agents = await _fleet.listAgents(ownerPubkey: ownerPubkey);
      return agents.length;
    } catch (_) {
      // Backend unreachable — fall back to index 0. On a fresh device this
      // is right; on a device with existing agents it produces a collision
      // that the on-chain InitializeAgent will reject, and the user
      // retries. Better than blocking onboarding on a backend hiccup.
      return 0;
    }
  }
}
