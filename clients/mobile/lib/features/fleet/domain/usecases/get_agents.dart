import 'package:dartz/dartz.dart';
import 'package:equatable/equatable.dart';

import '../../../../core/error/failures.dart';
import '../../../../core/usecase/usecase.dart';
import '../entities/agent.dart';
import '../repositories/fleet_repository.dart';

class GetAgents implements UseCase<List<Agent>, GetAgentsParams> {
  GetAgents(this._repository);
  final FleetRepository _repository;

  @override
  Future<Either<Failure, List<Agent>>> call(GetAgentsParams params) =>
      _repository.listAgents(ownerPubkey: params.ownerPubkey);
}

class GetAgentsParams extends Equatable {
  const GetAgentsParams({this.ownerPubkey});
  final String? ownerPubkey;

  @override
  List<Object?> get props => [ownerPubkey];
}
