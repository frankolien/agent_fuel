import 'package:equatable/equatable.dart';

class ConnectedWallet extends Equatable {
  const ConnectedWallet({
    required this.pubkeyBase58,
    required this.authToken,
    this.walletUriBase,
    this.accountLabel,
  });

  final String pubkeyBase58;
  final String authToken;
  final Uri? walletUriBase;
  final String? accountLabel;

  @override
  List<Object?> get props => [pubkeyBase58, authToken, walletUriBase, accountLabel];
}
