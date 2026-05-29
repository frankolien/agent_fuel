import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/agent.dart';

/// Contract that the presentation layer codes against. The data layer
/// supplies an implementation; tests can supply a fake.
abstract class FleetRepository {
  Future<Either<Failure, List<Agent>>> listAgents({String? ownerPubkey});
}
