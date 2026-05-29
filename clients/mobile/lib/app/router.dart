import 'package:auto_route/auto_route.dart';

import '../features/fleet/presentation/pages/fleet_page.dart';
import '../features/onboarding/presentation/pages/onboarding_page.dart';

part 'router.gr.dart';

@AutoRouterConfig()
class AppRouter extends RootStackRouter {
  @override
  List<AutoRoute> get routes => [
        AutoRoute(path: '/onboarding', page: OnboardingRoute.page, initial: true),
        AutoRoute(path: '/fleet', page: FleetRoute.page),
      ];
}
