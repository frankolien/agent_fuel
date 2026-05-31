import 'package:equatable/equatable.dart';

import '../../domain/entities/service.dart';

class ServicesState extends Equatable {
  const ServicesState({
    this.services = const [],
    this.loading = false,
    this.loadError,
    this.registering = false,
    this.registerError,
    this.lastRegisteredPubkey,
  });

  final List<Service> services;
  final bool loading;
  final String? loadError;
  final bool registering;
  final String? registerError;
  final String? lastRegisteredPubkey;

  ServicesState copyWith({
    List<Service>? services,
    bool? loading,
    Object? loadError = _unset,
    bool? registering,
    Object? registerError = _unset,
    Object? lastRegisteredPubkey = _unset,
  }) =>
      ServicesState(
        services: services ?? this.services,
        loading: loading ?? this.loading,
        loadError: loadError == _unset ? this.loadError : loadError as String?,
        registering: registering ?? this.registering,
        registerError: registerError == _unset
            ? this.registerError
            : registerError as String?,
        lastRegisteredPubkey: lastRegisteredPubkey == _unset
            ? this.lastRegisteredPubkey
            : lastRegisteredPubkey as String?,
      );

  @override
  List<Object?> get props => [
        services,
        loading,
        loadError,
        registering,
        registerError,
        lastRegisteredPubkey,
      ];
}

const _unset = Object();
