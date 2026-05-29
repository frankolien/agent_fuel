import 'package:equatable/equatable.dart';

abstract class FleetEvent extends Equatable {
  const FleetEvent();
  @override
  List<Object?> get props => const [];
}

/// Initial load or pull-to-refresh.
class FleetLoadRequested extends FleetEvent {
  const FleetLoadRequested({this.ownerPubkey});
  final String? ownerPubkey;
  @override
  List<Object?> get props => [ownerPubkey];
}

/// Internal — fired when [AgentFuelWsService] receives a push on the
/// channel we're watching. The handler re-fetches via HTTP so the rendered
/// list stays in sync with the backend's authoritative view.
class FleetLiveUpdateReceived extends FleetEvent {
  const FleetLiveUpdateReceived();
}
