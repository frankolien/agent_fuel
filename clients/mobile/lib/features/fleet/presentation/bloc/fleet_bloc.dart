import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/network/agent_fuel_ws_service.dart';
import '../../../../core/network/api_endpoint.dart';
import '../../data/repositories/fleet_repository.dart';
import '../../domain/entities/agent.dart';
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

  static const _maxHistory = 32;

  String? _lastOwnerPubkey;
  String? _watchedAgentPubkey;
  final List<TvlSnapshot> _history = [];
  Map<String, int> _priorScores = {};

  Future<void> _onLoad(
    FleetLoadRequested event,
    Emitter<FleetState> emit,
  ) async {
    _lastOwnerPubkey = event.ownerPubkey;
    final keepLoaded = state is FleetLoaded;
    if (!keepLoaded) emit(const FleetLoading());
    try {
      final agents =
          await _repository.listAgents(ownerPubkey: event.ownerPubkey);
      if (agents.isEmpty) {
        await _stopWatching();
        _history.clear();
        _priorScores = {};
        emit(FleetEmpty(ownerPubkey: event.ownerPubkey));
        return;
      }
      final tvl = agents.fold<int>(0, (s, a) => s + a.totalVolumeUsdc);
      _history.add(TvlSnapshot(DateTime.now(), tvl));
      if (_history.length > _maxHistory) {
        _history.removeRange(0, _history.length - _maxHistory);
      }
      final deltas = _computeDeltas(agents);
      _priorScores = {for (final a in agents) a.pubkey: a.score};
      emit(FleetLoaded(
        agents: agents,
        ownerPubkey: event.ownerPubkey,
        tvlHistory: List.unmodifiable(_history),
        scoreDeltas: deltas,
      ));
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

  Map<String, int> _computeDeltas(List<Agent> agents) {
    if (_priorScores.isEmpty) return const {};
    final out = <String, int>{};
    for (final a in agents) {
      final prev = _priorScores[a.pubkey];
      if (prev != null && prev != a.score) out[a.pubkey] = a.score - prev;
    }
    return out;
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
