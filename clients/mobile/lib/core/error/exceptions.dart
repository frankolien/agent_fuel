// Data-layer exception types — thrown by datasources, caught by repository
// implementations and translated into `Failure` values.

class ServerException implements Exception {
  ServerException(this.message, {this.statusCode});
  final String message;
  final int? statusCode;

  @override
  String toString() => 'ServerException($statusCode): $message';
}

class NotFoundException implements Exception {
  NotFoundException(this.message);
  final String message;
}

class NetworkException implements Exception {
  NetworkException([this.message = 'Network unavailable']);
  final String message;
}

class CacheException implements Exception {
  CacheException([this.message = 'Cache miss']);
  final String message;
}

class WalletException implements Exception {
  WalletException(this.message, {this.kind = WalletExceptionKind.unknown});
  final String message;
  final WalletExceptionKind kind;

  @override
  String toString() => 'WalletException($kind): $message';
}

enum WalletExceptionKind {
  noWalletInstalled,
  userCancelled,
  protocol,
  unsupportedPlatform,
  unknown,
}
