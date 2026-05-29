import 'package:equatable/equatable.dart';

abstract class FleetEvent extends Equatable {
  const FleetEvent();
  @override
  List<Object?> get props => const [];
}

class FleetLoadRequested extends FleetEvent {
  const FleetLoadRequested({this.ownerPubkey});
  final String? ownerPubkey;
  @override
  List<Object?> get props => [ownerPubkey];
}

class FleetLiveUpdateReceived extends FleetEvent {
  const FleetLiveUpdateReceived();
}
