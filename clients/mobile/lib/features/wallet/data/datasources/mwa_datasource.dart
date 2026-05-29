import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter/services.dart' show PlatformException;
import 'package:solana/solana.dart' show Ed25519HDPublicKey;
import 'package:solana_mobile_client/solana_mobile_client.dart';

import '../../../../core/config/env.dart';
import '../../../../core/error/exceptions.dart';

class MwaResult {
  MwaResult({
    required this.authToken,
    required this.pubkeyBase58,
    this.walletUriBase,
    this.accountLabel,
  });
  final String authToken;
  final String pubkeyBase58;
  final Uri? walletUriBase;
  final String? accountLabel;
}

class MwaDataSource {
  Future<MwaResult> authorize() => _runSession(_authorize);

  Future<MwaResult> reauthorize(String authToken) =>
      _runSession((client) => _reauthorize(client, authToken));

  Future<void> deauthorize(String authToken) async {
    if (!Platform.isAndroid) {
      throw WalletException(
        'Mobile Wallet Adapter is Android-only',
        kind: WalletExceptionKind.unsupportedPlatform,
      );
    }
    await _runSession((client) async {
      await client.deauthorize(authToken: authToken);
      return _emptyResult;
    });
  }

  Future<MwaResult> _runSession(
    Future<MwaResult> Function(MobileWalletAdapterClient client) op,
  ) async {
    if (!Platform.isAndroid) {
      throw WalletException(
        'Mobile Wallet Adapter is Android-only',
        kind: WalletExceptionKind.unsupportedPlatform,
      );
    }

    // Authoritative probe: asks PackageManager whether any installed app
    // can handle the MWA association intent. This is the only reliable way
    // to distinguish "no MWA wallet" from "session timed out for another
    // reason" — without it, every PlatformException looks the same.
    final available = await LocalAssociationScenario.isAvailable();
    if (!available) {
      throw WalletException(
        'No Mobile Wallet Adapter wallet found. Install Phantom, Solflare, '
        'Backpack, or Seeker\'s Seed Vault Wallet — and make sure it\'s '
        'updated to a version that supports MWA.',
        kind: WalletExceptionKind.noWalletInstalled,
      );
    }

    LocalAssociationScenario? session;
    try {
      debugPrint('[MWA] creating session');
      session = await LocalAssociationScenario.create();
      // Fire the solana-wallet:// intent. Android shows its chooser; the
      // selected wallet binds back on `session.start()`.
      debugPrint('[MWA] dispatching association intent');
      session.startActivityForResult(null).ignore();
      debugPrint('[MWA] awaiting wallet binding');
      final client = await session.start();
      debugPrint('[MWA] bound — running op');
      final result = await op(client);
      debugPrint('[MWA] op completed');
      return result;
    } on PlatformException catch (e, st) {
      debugPrint('[MWA] PlatformException code=${e.code} message=${e.message}');
      debugPrint('[MWA] details=${e.details}');
      debugPrint('[MWA] stack: $st');
      throw _classifyPlatformException(e);
    } on WalletException {
      rethrow;
    } catch (e, st) {
      debugPrint('[MWA] generic error type=${e.runtimeType}: $e');
      debugPrint('[MWA] stack: $st');
      throw WalletException(
        'Wallet connect failed: $e',
        kind: WalletExceptionKind.protocol,
      );
    } finally {
      // Closing a session the wallet already tore down throws on some
      // wallets — swallow so we don't mask the original exception (or the
      // success) with a teardown error.
      try {
        await session?.close();
      } catch (e) {
        debugPrint('[MWA] session.close() ignored: $e');
      }
    }
  }

  WalletException _classifyPlatformException(PlatformException e) {
    final msg = (e.message ?? '').toLowerCase();
    final code = e.code.toLowerCase();

    // Wallet ack'd the auth request and declined. Treat as user-driven.
    if (code.contains('cancel') ||
        msg.contains('cancel') ||
        msg.contains('declin')) {
      return WalletException(
        'Connection cancelled. Tap Connect wallet to try again.',
        kind: WalletExceptionKind.userCancelled,
      );
    }

    // session.start() blocks on Scenario.DEFAULT_CLIENT_TIMEOUT_MS waiting
    // for the wallet to bind back — when nothing happens (chooser dismissed,
    // wallet crashed) this surfaces as a timeout/IO error.
    if (code.contains('timeout') ||
        msg.contains('timeout') ||
        msg.contains('timed out') ||
        msg.contains('interrupt')) {
      return WalletException(
        'The wallet didn\'t respond in time. Try again — and make sure to '
        'tap a wallet in the Android chooser.',
        kind: WalletExceptionKind.protocol,
      );
    }

    if (code.contains('activitynotfound') ||
        msg.contains('no activity') ||
        msg.contains('no app')) {
      return WalletException(
        'No app on this device handled the wallet request.',
        kind: WalletExceptionKind.noWalletInstalled,
      );
    }

    return WalletException(
      'Wallet connect failed (${e.code}): ${e.message ?? 'unknown error'}',
      kind: WalletExceptionKind.protocol,
    );
  }

  Uri? get _iconUri =>
      AppEnv.identityIconUri.isEmpty ? null : Uri.parse(AppEnv.identityIconUri);

  Future<MwaResult> _authorize(MobileWalletAdapterClient client) async {
    final result = await client.authorize(
      identityUri: Uri.parse(AppEnv.identityUri),
      iconUri: _iconUri,
      identityName: AppEnv.identityName,
      cluster: AppEnv.cluster,
    );
    if (result == null) {
      throw WalletException(
        'Wallet declined to authorize. Try a different wallet, or make '
        'sure the wallet you tapped has a Solana account set up.',
        kind: WalletExceptionKind.userCancelled,
      );
    }
    return _toResult(result);
  }

  Future<MwaResult> _reauthorize(
    MobileWalletAdapterClient client,
    String authToken,
  ) async {
    final result = await client.reauthorize(
      identityUri: Uri.parse(AppEnv.identityUri),
      iconUri: _iconUri,
      identityName: AppEnv.identityName,
      authToken: authToken,
    );
    if (result == null) {
      throw WalletException(
        'Wallet declined to reauthorize. Tap Disconnect, then Connect again.',
        kind: WalletExceptionKind.userCancelled,
      );
    }
    return _toResult(result);
  }

  MwaResult _toResult(AuthorizationResult r) => MwaResult(
        authToken: r.authToken,
        pubkeyBase58: Ed25519HDPublicKey(r.publicKey).toBase58(),
        walletUriBase: r.walletUriBase,
        accountLabel: r.accountLabel,
      );

  static final _emptyResult = MwaResult(authToken: '', pubkeyBase58: '');
}
