import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';

import 'app/di.dart';
import 'app/router.dart';
import 'app/theme.dart';
import 'core/notifications/fcm_service.dart';
import 'features/auth/data/datasources/jwt_store.dart';
import 'features/wallet/data/repositories/wallet_repository.dart';

// Treat the JWT as expired this many seconds before its `exp` so a
// request in flight when the clock crosses the boundary still succeeds.
const _kJwtExpirySkewSeconds = 60;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await configureDependencies();
  // Best-effort: bring up FCM if google-services.json is present. The
  // service no-ops cleanly when Firebase init fails (no config dropped in
  // yet), so the rest of the app — in-app alerts WS, REST polling —
  // keeps working in either case.
  await sl<FcmService>().init();
  // If the user already authorised the wallet in a previous session,
  // re-register the FCM token under that owner so pushes resume without
  // waiting for the next manual connect.
  final cached = await sl<WalletRepository>().cachedConnection();
  if (cached != null) {
    await sl<FcmService>().registerForOwner(cached.pubkeyBase58);
  }
  // If the SIWS JWT is still valid, skip onboarding and land on the
  // fleet. Spend transactions still go through MWA each time, so this
  // only short-circuits the read-side login — funds stay safe.
  final jwt = await sl<JwtStore>().read();
  final hasValidJwt = jwt != null &&
      jwt.expiresAt.isAfter(
        DateTime.now().add(const Duration(seconds: _kJwtExpirySkewSeconds)),
      );
  runApp(AgentFuelApp(startAtFleet: hasValidJwt));
}

class AgentFuelApp extends StatelessWidget {
  const AgentFuelApp({super.key, this.startAtFleet = false});

  final bool startAtFleet;

  @override
  Widget build(BuildContext context) {
    final router = sl<AppRouter>();
    return MaterialApp.router(
      title: 'Agent Fuel',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      routerConfig: router.config(
        deepLinkBuilder: (deepLink) {
          // Only override the cold-start path. Once the app is alive,
          // honour whatever URL the user / push tap supplied.
          if (deepLink.path == '/' && startAtFleet) {
            return const DeepLink.path('/fleet');
          }
          return deepLink;
        },
      ),
    );
  }
}
