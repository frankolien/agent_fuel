import 'package:dartz/dartz.dart';
import 'package:equatable/equatable.dart';

import '../error/failures.dart';

/// Every use case takes one `Params` and returns `Either<Failure, T>`.
/// Use cases hold business rules; repositories hold data orchestration.
abstract class UseCase<T, P> {
  Future<Either<Failure, T>> call(P params);
}

/// Sentinel for use cases that take no parameters.
class NoParams extends Equatable {
  const NoParams();
  @override
  List<Object?> get props => const [];
}
