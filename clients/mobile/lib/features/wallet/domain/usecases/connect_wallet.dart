import 'package:dartz/dartz.dart';

import '../../../../core/error/failures.dart';
import '../../../../core/usecase/usecase.dart';
import '../entities/connected_wallet.dart';
import '../repositories/wallet_repository.dart';

class ConnectWallet implements UseCase<ConnectedWallet, NoParams> {
  ConnectWallet(this._repository);
  final WalletRepository _repository;

  @override
  Future<Either<Failure, ConnectedWallet>> call(NoParams params) =>
      _repository.connect();
}
