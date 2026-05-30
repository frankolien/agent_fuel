import 'package:get_it/get_it.dart';

import '../core/network/dio_client.dart';
import '../core/onchain/tx_preflight.dart';
import '../features/auth/data/datasources/biometric_service.dart';
import '../features/auth/data/datasources/jwt_store.dart';
import '../features/auth/data/repositories/auth_repository.dart';
import '../features/auth/domain/usecases/sign_in_with_solana.dart';
import '../features/agent_keys/data/datasources/agent_key_store.dart';
import '../features/agent_keys/data/datasources/agent_seed_derivation.dart';
import '../features/agent_keys/data/datasources/agent_seed_recovery_sweeper.dart';
import '../features/agents/domain/usecases/provision_agent.dart';
import '../features/alerts/data/repositories/alerts_repository.dart';
import '../features/fleet/data/onchain/vault_action_service.dart';
import '../features/fleet/data/repositories/fleet_repository.dart';
import '../features/fleet/presentation/bloc/fleet_bloc.dart';
import '../features/onboarding/data/onchain/agent_provisioning_service.dart';
import '../features/onboarding/presentation/bloc/onboarding_bloc.dart';
import '../features/wallet/data/datasources/auth_token_store.dart';
import '../features/wallet/data/datasources/mwa_datasource.dart';
import '../features/wallet/data/datasources/wallet_balance_service.dart';
import '../features/wallet/data/repositories/wallet_repository.dart';
import 'router.dart';

final GetIt sl = GetIt.instance;

Future<void> configureDependencies() async {
  // JwtStore comes first — the Dio auth interceptor reads it on every request.
  sl.registerLazySingleton<JwtStore>(JwtStore.new);
  sl.registerLazySingleton<DioClient>(() => DioClient(sl<JwtStore>()));
  sl.registerLazySingleton<AppRouter>(AppRouter.new);

  sl.registerLazySingleton<AuthRepository>(
    () => AuthRepository(sl<DioClient>().dio, sl<JwtStore>()),
  );
  sl.registerLazySingleton<BiometricService>(BiometricService.new);

  sl.registerLazySingleton<FleetRepository>(
    () => FleetRepository(sl<DioClient>().dio),
  );
  sl.registerFactory<FleetBloc>(
    () => FleetBloc(sl<FleetRepository>(), sl<AgentSeedRecoverySweeper>()),
  );
  sl.registerLazySingleton<VaultActionService>(
    () => VaultActionService(sl<MwaDataSource>(), sl<TxPreflight>()),
  );
  sl.registerLazySingleton<AlertsRepository>(
    () => AlertsRepository(sl<DioClient>().dio),
  );

  sl.registerLazySingleton<AuthTokenStore>(AuthTokenStore.new);
  sl.registerLazySingleton<MwaDataSource>(MwaDataSource.new);
  sl.registerLazySingleton<TxPreflight>(TxPreflight.new);
  sl.registerLazySingleton<WalletBalanceService>(WalletBalanceService.new);
  sl.registerLazySingleton<AgentProvisioningService>(
    AgentProvisioningService.new,
  );
  sl.registerLazySingleton<AgentKeyStore>(AgentKeyStore.new);
  sl.registerLazySingleton<AgentSeedDerivation>(
    () => AgentSeedDerivation(sl<WalletRepository>()),
  );
  sl.registerLazySingleton<AgentSeedRecoverySweeper>(
    () => AgentSeedRecoverySweeper(
      sl<WalletRepository>(),
      sl<AgentKeyStore>(),
      sl<AgentSeedDerivation>(),
    ),
  );
  sl.registerLazySingleton<ProvisionAgentUseCase>(
    () => ProvisionAgentUseCase(
      sl<FleetRepository>(),
      sl<AgentSeedDerivation>(),
      sl<AgentProvisioningService>(),
      sl<MwaDataSource>(),
      sl<AgentKeyStore>(),
      sl<TxPreflight>(),
    ),
  );
  sl.registerLazySingleton<WalletRepository>(
    () => WalletRepository(sl<MwaDataSource>(), sl<AuthTokenStore>()),
  );

  sl.registerLazySingleton<SignInWithSolana>(
    () => SignInWithSolana(sl<AuthRepository>(), sl<WalletRepository>()),
  );

  sl.registerFactory<OnboardingBloc>(
    () => OnboardingBloc(
      sl<WalletRepository>(),
      sl<SignInWithSolana>(),
      sl<WalletBalanceService>(),
      sl<FleetRepository>(),
      sl<BiometricService>(),
      sl<ProvisionAgentUseCase>(),
    ),
  );
}
