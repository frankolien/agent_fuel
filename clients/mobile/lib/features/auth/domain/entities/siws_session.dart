import 'package:equatable/equatable.dart';

class SiwsSession extends Equatable {
  const SiwsSession({required this.token, required this.expiresAt});
  final String token;
  final DateTime expiresAt;

  bool get isExpired => DateTime.now().isAfter(expiresAt);

  @override
  List<Object?> get props => [token, expiresAt];
}
