import 'package:flutter/material.dart';

import 'app/di.dart';
import 'app/router.dart';
import 'app/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await configureDependencies();
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
