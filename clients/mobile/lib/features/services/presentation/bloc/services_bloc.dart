import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/error/exceptions.dart';
import '../../data/repositories/services_repository.dart';
import '../../domain/usecases/register_service.dart';
import 'services_event.dart';
import 'services_state.dart';

class ServicesBloc extends Bloc<ServicesEvent, ServicesState> {
  ServicesBloc(this._repository, this._register)
      : super(const ServicesState()) {
    on<ServicesLoadRequested>(_onLoad);
    on<ServiceRegisterRequested>(_onRegister);
    on<ServiceRegisterCleared>((_, emit) => emit(state.copyWith(
          registerError: null,
          lastRegisteredPubkey: null,
        )));
  }

  final ServicesRepository _repository;
  final RegisterServiceUseCase _register;

  Future<void> _onLoad(
    ServicesLoadRequested _,
    Emitter<ServicesState> emit,
  ) async {
    emit(state.copyWith(loading: true, loadError: null));
    try {
      final list = await _repository.list();
      emit(state.copyWith(services: list, loading: false));
    } on ServerException catch (e) {
      emit(state.copyWith(loading: false, loadError: e.message));
    } on NetworkException catch (e) {
      emit(state.copyWith(loading: false, loadError: e.message));
    } catch (e) {
      emit(state.copyWith(loading: false, loadError: e.toString()));
    }
  }

  Future<void> _onRegister(
    ServiceRegisterRequested event,
    Emitter<ServicesState> emit,
  ) async {
    emit(state.copyWith(
      registering: true,
      registerError: null,
      lastRegisteredPubkey: null,
    ));
    try {
      final pubkey = await _register(
        ownerPubkeyBase58: event.ownerPubkeyBase58,
        walletAuthToken: event.walletAuthToken,
        name: event.name,
        category: event.category,
        serviceUri: event.serviceUri,
      );
      emit(state.copyWith(
        registering: false,
        lastRegisteredPubkey: pubkey,
      ));
      // Refresh the list so the new service shows up. Backend mirror may
      // lag the on-chain confirmation by a slot; the user can pull-to-
      // refresh if it hasn't appeared yet.
      add(const ServicesLoadRequested());
    } on OnchainSimulationException catch (e) {
      emit(state.copyWith(registering: false, registerError: e.message));
    } on WalletException catch (e) {
      emit(state.copyWith(registering: false, registerError: e.message));
    } on ServerException catch (e) {
      emit(state.copyWith(registering: false, registerError: e.message));
    } catch (e) {
      emit(state.copyWith(registering: false, registerError: e.toString()));
    }
  }
}
