// Smoke test — confirms the root widget builds without throwing. Replace
// with proper bloc + widget tests as features land.

import 'package:agent_fuel_mobile/app/di.dart';
import 'package:agent_fuel_mobile/main.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('App boots', (tester) async {
    await configureDependencies();
    await tester.pumpWidget(const AgentFuelApp());
  });
}
