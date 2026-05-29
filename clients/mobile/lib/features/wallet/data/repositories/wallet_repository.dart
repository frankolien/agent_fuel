import 'dart:typed_data' show Uint8List;

import 'package:solana/solana.dart' show Ed25519HDPublicKey;

import '../../../../core/error/exceptions.dart';
import '../../domain/entities/connected_wallet.dart';
import '../datasources/auth_token_store.dart';
import '../datasources/mwa_datasource.dart';

class WalletRepository {
  WalletRepository(this._mwa, this._store);

  final MwaDataSource _mwa;
  final AuthTokenStore _store;

  Future<ConnectedWallet> connect() async {
    final result = await _runWalletOp(_mwa.authorize);
    await _persist(result);
    return _toEntity(result);
  }

  Future<ConnectedWallet> reauthorize(String authToken) async {
    final result = await _runWalletOp(() => _mwa.reauthorize(authToken));
    await _persist(result);
    return _toEntity(result);
  }

  Future<void> disconnect(String authToken) async {
    try {
      await _mwa.deauthorize(authToken);
    } on WalletException {
      // The user wants out — keep going so we still clear local state.
    }
    await _store.clear();
  }

  Future<Uint8List> signMessage({
    required String authToken,
    required String pubkeyBase58,
    required Uint8List message,
  }) async {
    final addressBytes = Uint8List.fromList(
      Ed25519HDPublicKey.fromBase58(pubkeyBase58).bytes,
    );
    try {
      return await _mwa.signMessage(
        authToken: authToken,
        message: message,
        addressBytes: addressBytes,
      );
    } on WalletException catch (e) {
      throw WalletException(_userMessage(e), kind: e.kind);
    }
  }

  Future<ConnectedWallet?> cachedConnection() async {
    final cached = await _store.read();
    if (cached == null) return null;
    return ConnectedWallet(
      pubkeyBase58: cached.pubkey,
      authToken: cached.authToken,
      walletUriBase:
          cached.walletUri == null ? null : Uri.tryParse(cached.walletUri!),
      accountLabel: cached.accountLabel,
    );
  }

  Future<MwaResult> _runWalletOp(Future<MwaResult> Function() op) async {
    try {
      return await op();
    } on WalletException catch (e) {
      throw WalletException(_userMessage(e), kind: e.kind);
    }
  }

  Future<void> _persist(MwaResult r) => _store.save(
        authToken: r.authToken,
        pubkeyBase58: r.pubkeyBase58,
        walletUriBase: r.walletUriBase?.toString(),
        accountLabel: r.accountLabel,
      );

  ConnectedWallet _toEntity(MwaResult r) => ConnectedWallet(
        pubkeyBase58: r.pubkeyBase58,
        authToken: r.authToken,
        walletUriBase: r.walletUriBase,
        accountLabel: r.accountLabel,
      );

  String _userMessage(WalletException e) {
    switch (e.kind) {
      case WalletExceptionKind.noWalletInstalled:
        return 'No Solana wallet found on this device. Install Phantom, '
            'Solflare, Backpack, or use Seeker\'s Seed Vault Wallet.';
      case WalletExceptionKind.userCancelled:
        return 'Wallet closed without authorizing. Most often this means '
            'devnet isn\'t enabled in the wallet you tapped:\n\n'
            '• Phantom — Settings → Developer Settings → Testnet Mode → Solana Devnet\n'
            '• Solflare — Settings → Network → Devnet\n\n'
            'Enable it, then try again.';
      case WalletExceptionKind.unsupportedPlatform:
        return 'Wallet connect is Android-only for now.';
      case WalletExceptionKind.protocol:
      case WalletExceptionKind.unknown:
        return e.message;
    }
  }
}
