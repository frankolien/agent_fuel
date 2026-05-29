import 'package:equatable/equatable.dart';

import '../../domain/entities/agent.dart';

class TvlSnapshot extends Equatable {
  const TvlSnapshot(this.at, this.tvlUsdcMicro);
  final DateTime at;
  final int tvlUsdcMicro;

  @override
  List<Object?> get props => [at, tvlUsdcMicro];
}

abstract class FleetState extends Equatable {
  const FleetState();
  @override
  List<Object?> get props => const [];
}

class FleetInitial extends FleetState {
  const FleetInitial();
}

class FleetLoading extends FleetState {
  const FleetLoading();
}

class FleetLoaded extends FleetState {
  const FleetLoaded({
    required this.agents,
    required this.ownerPubkey,
    required this.tvlHistory,
    required this.scoreDeltas,
  });

  final List<Agent> agents;
  final String? ownerPubkey;
  final List<TvlSnapshot> tvlHistory;
  final Map<String, int> scoreDeltas;

  int get tvlUsdcMicro =>
      agents.fold<int>(0, (sum, a) => sum + a.totalVolumeUsdc);

  double get avgScore {
    if (agents.isEmpty) return 0;
    final scored = agents.where((a) => a.isScored).toList();
    if (scored.isEmpty) return 0;
    final total = scored.fold<int>(0, (s, a) => s + a.score);
    return total / scored.length;
  }

  int get activeCount => agents.where((a) => a.isScored).length;

  double? get tvlDeltaPct {
    if (tvlHistory.length < 2) return null;
    final first = tvlHistory.first.tvlUsdcMicro;
    final last = tvlHistory.last.tvlUsdcMicro;
    if (first == 0) return null;
    return (last - first) / first;
  }

  @override
  List<Object?> get props =>
      [agents, ownerPubkey, tvlHistory, scoreDeltas];
}

class FleetEmpty extends FleetState {
  const FleetEmpty({this.ownerPubkey});
  final String? ownerPubkey;
  @override
  List<Object?> get props => [ownerPubkey];
}

class FleetWalletRequired extends FleetState {
  const FleetWalletRequired();
}

class FleetError extends FleetState {
  const FleetError(this.message);
  final String message;
  @override
  List<Object?> get props => [message];
}
