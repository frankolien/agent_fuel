import 'package:equatable/equatable.dart';

import '../../domain/entities/agent.dart';

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
  const FleetLoaded(this.agents);
  final List<Agent> agents;
  @override
  List<Object?> get props => [agents];
}

class FleetEmpty extends FleetState {
  const FleetEmpty();
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
