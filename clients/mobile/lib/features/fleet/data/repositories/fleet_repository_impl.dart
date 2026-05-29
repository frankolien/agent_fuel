import 'package:dartz/dartz.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/error/failures.dart';
import '../../domain/entities/agent.dart';
import '../../domain/repositories/fleet_repository.dart';
import '../datasources/fleet_remote_datasource.dart';

class FleetRepositoryImpl implements FleetRepository {
  FleetRepositoryImpl(this._remote);
  final FleetRemoteDataSource _remote;

  @override
  Future<Either<Failure, List<Agent>>> listAgents({String? ownerPubkey}) async {
    try {
      final models = await _remote.listAgents(ownerPubkey: ownerPubkey);
      return Right(models);
    } on NotFoundException {
      // Empty roster is a legitimate state, not an error.
      return const Right(<Agent>[]);
    } on ServerException catch (e) {
      // Backend gates this endpoint behind a SIWS-issued JWT. Until the
      // wallet flow lands (4.1b) and we attach an Authorization header, a
      // 401 is the expected response on cold-boot — surface it as its own
      // failure type so the UI can prompt the user to sign in rather than
      // showing a generic error.
      if (e.statusCode == 401 || e.statusCode == 403) {
        return const Left(WalletFailure('Wallet sign-in required'));
      }
      return Left(ServerFailure(e.message, statusCode: e.statusCode));
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } catch (e) {
      return Left(UnexpectedFailure(e.toString()));
    }
  }
}
