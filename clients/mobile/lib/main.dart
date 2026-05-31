import 'package:flutter/material.dart';

import 'app/di.dart';
import 'app/router.dart';
import 'app/theme.dart';
import 'core/notifications/fcm_service.dart';
import 'features/wallet/data/repositories/wallet_repository.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await configureDependencies();
  // Best-effort: bring up FCM if google-services.json is present. The
  // service no-ops cleanly when Firebase init fails (no config dropped in
  // yet), so the rest of the app — in-app alerts WS, REST polling —
  // keeps working in either case.
  await sl<FcmService>().init();
  // If the user already authorised the wallet in a previous session,
  // re-register the FCM token under that owner `so pushes resume without
  // waiting for the next manual connect.
  final cached = await sl<WalletRepository>().cachedConnection();
  if (cached != null) {
    await sl<FcmService>().registerForOwner(cached.pubkeyBase58);
  }
  runApp(const AgentFuelApp());
}

class AgentFuelApp extends StatelessWidget {
  const AgentFuelApp({super.key});

  @override
  Widget build(BuildContext context) {
    final router = sl<AppRouter>();
    return MaterialApp.router(
      title: 'Agent Fuel',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      routerConfig: router.config(),
    );
  }
}
