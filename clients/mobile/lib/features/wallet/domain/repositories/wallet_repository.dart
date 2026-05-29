import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../entities/connected_wallet.dart';

abstract class WalletRepository {
  Future<Either<Failure, ConnectedWallet>> connect();
  Future<Either<Failure, ConnectedWallet>> reauthorize(String authToken);
  Future<Either<Failure, Unit>> disconnect(String authToken);
  Future<ConnectedWallet?> cachedConnection();
}
