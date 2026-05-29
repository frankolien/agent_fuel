import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/network/agent_fuel_ws_service.dart';
import '../../../../core/network/api_endpoint.dart';
import '../../data/repositories/fleet_repository.dart';
import 'fleet_event.dart';
import 'fleet_state.dart';

class FleetBloc extends Bloc<FleetEvent, FleetState> {
  FleetBloc(this._repository) : super(const FleetInitial()) {
    _ws = AgentFuelWsService(onChange: () {
      if (isClosed) return;
      add(const FleetLiveUpdateReceived());
    });
    on<FleetLoadRequested>(_onLoad);
    on<FleetLiveUpdateReceived>(
      (_, __) => add(FleetLoadRequested(ownerPubkey: _lastOwnerPubkey)),
    );
  }

  final FleetRepository _repository;
  late final AgentFuelWsService _ws;

  String? _lastOwnerPubkey;
  String? _watchedAgentPubkey;

  Future<void> _onLoad(
    FleetLoadRequested event,
    Emitter<FleetState> emit,
  ) async {
    _lastOwnerPubkey = event.ownerPubkey;
    emit(const FleetLoading());
    try {
      final agents = await _repository.listAgents(ownerPubkey: event.ownerPubkey);
      if (agents.isEmpty) {
        await _stopWatching();
        emit(const FleetEmpty());
        return;
      }
      emit(FleetLoaded(agents));
      final firstPubkey = agents.first.pubkey;
      if (_watchedAgentPubkey != firstPubkey) {
        _watchedAgentPubkey = firstPubkey;
        _ws.watch(ApiEndpoint.wsAgent(firstPubkey));
      }
    } on ServerException catch (e) {
      if (e.statusCode == 401 || e.statusCode == 403) {
        emit(const FleetWalletRequired());
      } else {
        emit(FleetError(e.message));
      }
    } on NetworkException catch (e) {
      emit(FleetError(e.message));
    } catch (e) {
      emit(FleetError(e.toString()));
    }
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
