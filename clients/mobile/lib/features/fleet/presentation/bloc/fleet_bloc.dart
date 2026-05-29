import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/error/failures.dart';
import '../../../../core/network/agent_fuel_ws_service.dart';
import '../../../../core/network/api_endpoint.dart';
import '../../domain/usecases/get_agents.dart';
import 'fleet_event.dart';
import 'fleet_state.dart';

class FleetBloc extends Bloc<FleetEvent, FleetState> {
  FleetBloc(this._getAgents) : super(const FleetInitial()) {
    _ws = AgentFuelWsService(onChange: () {
      if (isClosed) return;
      add(const FleetLiveUpdateReceived());
    });
    on<FleetLoadRequested>(_onLoad);
    on<FleetLiveUpdateReceived>(
      (_, __) => add(FleetLoadRequested(ownerPubkey: _lastOwnerPubkey)),
    );
  }

  final GetAgents _getAgents;
  late final AgentFuelWsService _ws;

  String? _lastOwnerPubkey;
  String? _watchedAgentPubkey;

  Future<void> _onLoad(
    FleetLoadRequested event,
    Emitter<FleetState> emit,
  ) async {
    _lastOwnerPubkey = event.ownerPubkey;
    emit(const FleetLoading());
    final result = await _getAgents(GetAgentsParams(ownerPubkey: event.ownerPubkey));
    result.fold(
      (failure) {
        if (failure is WalletFailure) {
          emit(const FleetWalletRequired());
        } else {
          emit(FleetError(failure.message));
        }
      },
      (agents) {
        if (agents.isEmpty) {
          emit(const FleetEmpty());
          _stopWatching();
          return;
        }
        emit(FleetLoaded(agents));
        // Subscribe to the first agent's WS channel so any backend event
        // (payment, score, freeze) triggers a fleet refetch. A fleet-wide
        // channel would scale better — this is enough until we land one.
        final firstPubkey = agents.first.pubkey;
        if (_watchedAgentPubkey != firstPubkey) {
          _watchedAgentPubkey = firstPubkey;
          _ws.watch(ApiEndpoint.wsAgent(firstPubkey));
        }
      },
    );
  }

  Future<void> _stopWatching() async {
    _watchedAgentPubkey = null;
    await _ws.stop();
  }

  @override
  Future<void> close() async {
    await _ws.dispose();
    return super.close();
  }
}
