import 'dart:convert' show utf8;

import 'package:solana/base58.dart' show base58encode;

import '../../../wallet/data/repositories/wallet_repository.dart';
import '../../data/repositories/auth_repository.dart';
import '../entities/siws_session.dart';

class SignInWithSolana {
  SignInWithSolana(this._auth, this._wallet);

  final AuthRepository _auth;
  final WalletRepository _wallet;

  /// Runs the full SIWS handshake: ask the backend for a nonce, ask the
  /// wallet to sign it, exchange the signature for a JWT.
  Future<SiwsSession> call({
    required String pubkeyBase58,
    required String walletAuthToken,
  }) async {
    final challenge = await _auth.requestNonce(pubkeyBase58);
    final signature = await _wallet.signMessage(
      authToken: walletAuthToken,
      pubkeyBase58: pubkeyBase58,
      message: utf8.encode(challenge.message),
    );
    return _auth.verify(
      pubkeyBase58: pubkeyBase58,
      nonce: challenge.nonce,
      signatureBase58: base58encode(signature),
    );
  }
}
