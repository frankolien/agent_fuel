import 'package:get_it/get_it.dart';

import '../core/network/dio_client.dart';
import '../features/fleet/data/datasources/fleet_remote_datasource.dart';
import '../features/fleet/data/repositories/fleet_repository_impl.dart';
import '../features/fleet/domain/repositories/fleet_repository.dart';
import '../features/fleet/domain/usecases/get_agents.dart';
import '../features/fleet/presentation/bloc/fleet_bloc.dart';
import '../features/onboarding/presentation/bloc/onboarding_bloc.dart';
import '../features/wallet/data/datasources/auth_token_store.dart';
import '../features/wallet/data/datasources/mwa_datasource.dart';
import '../features/wallet/data/repositories/wallet_repository_impl.dart';
import '../features/wallet/domain/repositories/wallet_repository.dart';
import '../features/wallet/domain/usecases/connect_wallet.dart';
import 'router.dart';

/// Hand-wired DI graph. Could be generated with `injectable` once the surface
/// grows; for the 4.1 slice the wiring is small enough to read top-to-bottom.
final GetIt sl = GetIt.instance;

Future<void> configureDependencies() async {
  // Core.
  sl.registerLazySingleton<DioClient>(DioClient.new);
  sl.registerLazySingleton<AppRouter>(AppRouter.new);

  // Fleet feature.
  sl.registerLazySingleton<FleetRemoteDataSource>(
    () => FleetRemoteDataSourceImpl(sl<DioClient>().dio),
  );
  sl.registerLazySingleton<FleetRepository>(
    () => FleetRepositoryImpl(sl<FleetRemoteDataSource>()),
  );
  sl.registerLazySingleton<GetAgents>(() => GetAgents(sl<FleetRepository>()));
  sl.registerFactory<FleetBloc>(() => FleetBloc(sl<GetAgents>()));

  // Wallet feature — Mobile Wallet Adapter on Android.
  sl.registerLazySingleton<AuthTokenStore>(AuthTokenStore.new);
  sl.registerLazySingleton<MwaDataSource>(MwaDataSource.new);
  sl.registerLazySingleton<WalletRepository>(
    () => WalletRepositoryImpl(sl<MwaDataSource>(), sl<AuthTokenStore>()),
  );
  sl.registerLazySingleton<ConnectWallet>(
    () => ConnectWallet(sl<WalletRepository>()),
  );

  // Onboarding bloc — depends on the wallet connect use case + repository
  // (the repository lets the bloc restore cached connections on mount and
  // call deauthorize on disconnect).
  sl.registerFactory<OnboardingBloc>(
    () => OnboardingBloc(sl<ConnectWallet>(), sl<WalletRepository>()),
  );
}
