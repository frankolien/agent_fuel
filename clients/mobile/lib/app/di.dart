import 'package:get_it/get_it.dart';

import '../core/network/dio_client.dart';
import '../core/notifications/fcm_service.dart';
import '../core/onchain/dev_airdrop_service.dart';
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
import '../features/services/data/datasources/service_key_store.dart';
import '../features/services/data/datasources/service_seed_derivation.dart';
import '../features/services/data/onchain/service_provisioning_service.dart';
import '../features/services/data/repositories/services_repository.dart';
import '../features/services/domain/usecases/register_service.dart';
import '../features/services/presentation/bloc/services_bloc.dart';
import '../features/wallet/data/datasources/auth_token_store.dart';
import '../features/wallet/data/datasources/mwa_datasource.dart';
import '../features/wallet/data/datasources/phantom_deeplink_datasource.dart';
import '../features/wallet/data/datasources/phantom_session_store.dart';
import '../features/wallet/data/datasources/wallet_balance_service.dart';
import '../features/wallet/data/repositories/wallet_repository.dart';
import 'router.dart';

final GetIt sl = GetIt.instance;

Future<void> configureDependencies() async {
  // JwtStore comes first — the Dio auth interceptor reads it on every request.
  sl.registerLazySingleton<JwtStore>(JwtStore.new);
  sl.registerLazySingleton<AppRouter>(AppRouter.new);
  sl.registerLazySingleton<DioClient>(
    // On 401 the interceptor clears the JWT and bounces to onboarding so
    // the user re-signs instead of facing a dead fleet screen. We resolve
    // the router lazily inside the callback so the AppRouter singleton is
    // ready by the time the first request fires.
    () => DioClient(
      sl<JwtStore>(),
      onUnauthorized: () =>
          sl<AppRouter>().replaceAll([const OnboardingRoute()]),
    ),
  );

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
    () => AlertsRepository(sl<DioClient>().dio, sl<JwtStore>()),
  );

  sl.registerLazySingleton<AuthTokenStore>(AuthTokenStore.new);
  sl.registerLazySingleton<PhantomSessionStore>(PhantomSessionStore.new);
  sl.registerLazySingleton<MwaDataSource>(MwaDataSource.new);
  sl.registerLazySingleton<PhantomDeeplinkDataSource>(
    () => PhantomDeeplinkDataSource(sessionStore: sl<PhantomSessionStore>()),
  );
  sl.registerLazySingleton<TxPreflight>(TxPreflight.new);
  sl.registerLazySingleton<DevAirdropService>(
    () => DevAirdropService(sl<DioClient>()),
  );
  sl.registerLazySingleton<WalletBalanceService>(WalletBalanceService.new);
  sl.registerLazySingleton<FcmService>(() => FcmService(sl<DioClient>()));
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
    () => WalletRepository(
      sl<MwaDataSource>(),
      sl<AuthTokenStore>(),
      sl<PhantomDeeplinkDataSource>(),
      sl<PhantomSessionStore>(),
    ),
  );

  sl.registerLazySingleton<SignInWithSolana>(
    () => SignInWithSolana(sl<AuthRepository>(), sl<WalletRepository>()),
  );

  // Services — register, list, key-derive. Same shape as the agent
  // graph above; service seeds reuse the wallet master signature but
  // live in a distinct HMAC keyspace so they don't collide with agents.
  sl.registerLazySingleton<ServiceKeyStore>(ServiceKeyStore.new);
  sl.registerLazySingleton<ServiceSeedDerivation>(
    () => ServiceSeedDerivation(sl<WalletRepository>()),
  );
  sl.registerLazySingleton<ServiceProvisioningService>(
    ServiceProvisioningService.new,
  );
  sl.registerLazySingleton<ServicesRepository>(
    () => ServicesRepository(sl<DioClient>().dio),
  );
  sl.registerLazySingleton<RegisterServiceUseCase>(
    () => RegisterServiceUseCase(
      sl<ServiceSeedDerivation>(),
      sl<ServiceProvisioningService>(),
      sl<MwaDataSource>(),
      sl<ServiceKeyStore>(),
      sl<TxPreflight>(),
    ),
  );
  sl.registerFactory<ServicesBloc>(
    () => ServicesBloc(sl<ServicesRepository>(), sl<RegisterServiceUseCase>()),
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
