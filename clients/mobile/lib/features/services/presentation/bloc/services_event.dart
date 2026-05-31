import 'package:equatable/equatable.dart';

import '../../domain/entities/service_category.dart';

sealed class ServicesEvent extends Equatable {
  const ServicesEvent();
  @override
  List<Object?> get props => const [];
}

class ServicesLoadRequested extends ServicesEvent {
  const ServicesLoadRequested();
}

class ServiceRegisterRequested extends ServicesEvent {
  const ServiceRegisterRequested({
    required this.ownerPubkeyBase58,
    required this.walletAuthToken,
    required this.name,
    required this.category,
    required this.serviceUri,
  });

  final String ownerPubkeyBase58;
  final String walletAuthToken;
  final String name;
  final ServiceCategory category;
  final String serviceUri;

  @override
  List<Object?> get props =>
      [ownerPubkeyBase58, name, category, serviceUri];
}

class ServiceRegisterCleared extends ServicesEvent {
  const ServiceRegisterCleared();
}
