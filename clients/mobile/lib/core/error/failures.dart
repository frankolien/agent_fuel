import 'package:equatable/equatable.dart';

/// Domain-layer error type. Repositories return `Either<Failure, T>` so the
/// presentation layer never has to catch raw exceptions — failures are values.
sealed class Failure extends Equatable {
  const Failure(this.message);
  final String message;

  @override
  List<Object?> get props => [message];
}

class ServerFailure extends Failure {
  const ServerFailure(super.message, {this.statusCode});
  final int? statusCode;

  @override
  List<Object?> get props => [message, statusCode];
}

class NotFoundFailure extends Failure {
  const NotFoundFailure([super.message = 'Not found']);
}

class NetworkFailure extends Failure {
  const NetworkFailure([super.message = 'Network unavailable']);
}

class WalletFailure extends Failure {
  const WalletFailure(super.message);
}

class CacheFailure extends Failure {
  const CacheFailure([super.message = 'Cache read failed']);
}

class UnexpectedFailure extends Failure {
  const UnexpectedFailure([super.message = 'Unexpected error']);
}
