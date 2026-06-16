import 'dart:io' show Platform;
import 'dart:typed_data' show Uint8List;

import 'package:solana/solana.dart' show Ed25519HDPublicKey;

import '../../../../core/error/exceptions.dart';
import '../../domain/entities/connected_wallet.dart';
import '../datasources/auth_token_store.dart';
import '../datasources/mwa_datasource.dart';
import '../datasources/phantom_deeplink_datasource.dart';
import '../datasources/phantom_session_store.dart';

class WalletRepository {
  WalletRepository(this._mwa, this._store, this._phantom, this._phantomStore);

  final MwaDataSource _mwa;
  final AuthTokenStore _store;
  final PhantomDeeplinkDataSource _phantom;
  final PhantomSessionStore _phantomStore;

  Future<ConnectedWallet> connect() async {
    final result = await _runWalletOp(
      Platform.isIOS ? _phantom.authorize : _mwa.authorize,
    );
    await _persist(result);
    return _toEntity(result);
  }

  Future<ConnectedWallet> reauthorize(String authToken) async {
    if (Platform.isIOS) {
      // Phantom Deeplinks has no silent reauthorize — the session token is
      // checked the next time we send a signed payload. Surface the cached
      // identity so the UI can move on; sign calls will fail loudly if the
      // session is stale.
      final cached = await _store.read();
      if (cached == null) {
        throw WalletException(
          'No cached wallet. Tap Connect to start over.',
          kind: WalletExceptionKind.protocol,
        );
      }
      return ConnectedWallet(
        pubkeyBase58: cached.pubkey,
        authToken: cached.authToken,
        walletUriBase:
            cached.walletUri == null ? null : Uri.tryParse(cached.walletUri!),
        accountLabel: cached.accountLabel,
      );
    }
    final result = await _runWalletOp(() => _mwa.reauthorize(authToken));
    await _persist(result);
    return _toEntity(result);
  }

  Future<void> disconnect(String authToken) async {
    try {
      if (Platform.isIOS) {
        await _phantom.deauthorize();
      } else {
        await _mwa.deauthorize(authToken);
      }
    } on WalletException {
      // The user wants out — keep going so we still clear local state.
    }
    await _phantomStore.clear();
    await _store.clear();
  }

  Future<Uint8List> signMessage({
    required String authToken,
    required String pubkeyBase58,
    required Uint8List message,
  }) async {
    if (Platform.isIOS) {
      // Phantom Deeplinks supports signMessage — same handshake pattern as
      // connect, with the message encrypted via the persisted dapp keypair.
      // Lands in the iOS slice-2 follow-up; for now any caller (SIWS, seed
      // derivation) sees a clear "not yet" rather than an MWA crash.
      throw WalletException(
        'Signing on iOS isn\'t wired yet — this build only ships the connect '
        'handshake. Track follow-up work for signMessage / sign-and-send.',
        kind: WalletExceptionKind.unsupportedPlatform,
      );
    }
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
    if (Platform.isIOS) return _iosUserMessage(e);
    return _androidUserMessage(e);
  }

  String _androidUserMessage(WalletException e) {
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
        return 'Wallet connect is Android-only on this build.';
      case WalletExceptionKind.protocol:
      case WalletExceptionKind.unknown:
        return e.message;
    }
  }

  String _iosUserMessage(WalletException e) {
    switch (e.kind) {
      case WalletExceptionKind.noWalletInstalled:
        return 'Phantom isn\'t installed. Install it from the App Store and '
            'try again.';
      case WalletExceptionKind.userCancelled:
        // Trust the Phantom datasource — its messages are already shaped for
        // end-users (timeout text, decrypt-failed text, Phantom error text).
        return e.message;
      case WalletExceptionKind.unsupportedPlatform:
        return e.message;
      case WalletExceptionKind.protocol:
      case WalletExceptionKind.unknown:
        return e.message;
    }
  }
}
