import 'dart:io' show Platform;
import 'dart:typed_data' show Uint8List;

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

  Future<Uint8List> signMessage({
    required String authToken,
    required Uint8List message,
    required Uint8List addressBytes,
  }) async {
    _ensureAndroid();
    LocalAssociationScenario? session;
    try {
      session = await LocalAssociationScenario.create();
      session.startActivityForResult(null).ignore();
      final client = await session.start();
      final reauth = await client.reauthorize(
        identityUri: Uri.parse(AppEnv.identityUri),
        iconUri: _iconUri,
        identityName: AppEnv.identityName,
        authToken: authToken,
      );
      if (reauth == null) {
        throw WalletException(
          'Wallet declined to reauthorize. Disconnect and reconnect.',
          kind: WalletExceptionKind.userCancelled,
        );
      }
      final result = await client.signMessages(
        messages: [message],
        addresses: [addressBytes],
      );
      if (result.signedMessages.isEmpty ||
          result.signedMessages.first.signatures.isEmpty) {
        throw WalletException(
          'Wallet declined to sign the sign-in message.',
          kind: WalletExceptionKind.userCancelled,
        );
      }
      return result.signedMessages.first.signatures.first;
    } on PlatformException catch (e) {
      throw _classifyPlatformException(e);
    } on WalletException {
      rethrow;
    } catch (e) {
      throw WalletException(
        'Sign-in signature failed: $e',
        kind: WalletExceptionKind.protocol,
      );
    } finally {
      await _safeClose(session);
    }
  }

  Future<void> deauthorize(String authToken) async {
    _ensureAndroid();
    await _runSession((client) async {
      await client.deauthorize(authToken: authToken);
      return _emptyResult;
    });
  }

  Future<MwaResult> _runSession(
    Future<MwaResult> Function(MobileWalletAdapterClient client) op,
  ) async {
    _ensureAndroid();

    // PackageManager probe — distinguishes "no MWA wallet installed" from a
    // generic session failure. Without it every PlatformException looks the
    // same to the caller.
    if (!await LocalAssociationScenario.isAvailable()) {
      throw WalletException(
        'No Mobile Wallet Adapter wallet found. Install Phantom, Solflare, '
        'Backpack, or Seeker\'s Seed Vault Wallet.',
        kind: WalletExceptionKind.noWalletInstalled,
      );
    }

    LocalAssociationScenario? session;
    try {
      session = await LocalAssociationScenario.create();
      session.startActivityForResult(null).ignore();
      final client = await session.start();
      return await op(client);
    } on PlatformException catch (e) {
      throw _classifyPlatformException(e);
    } on WalletException {
      rethrow;
    } catch (e) {
      throw WalletException(
        'Wallet connect failed: $e',
        kind: WalletExceptionKind.protocol,
      );
    } finally {
      await _safeClose(session);
    }
  }

  void _ensureAndroid() {
    if (!Platform.isAndroid) {
      throw WalletException(
        'Mobile Wallet Adapter is Android-only',
        kind: WalletExceptionKind.unsupportedPlatform,
      );
    }
  }

  Future<void> _safeClose(LocalAssociationScenario? session) async {
    try {
      await session?.close();
    } catch (_) {
      // Some wallets tear down the session themselves; closing a torn-down
      // session throws. Swallow so we don't mask the real outcome.
    }
  }

  WalletException _classifyPlatformException(PlatformException e) {
    final msg = (e.message ?? '').toLowerCase();
    final code = e.code.toLowerCase();

    if (code.contains('cancel') ||
        msg.contains('cancel') ||
        msg.contains('declin')) {
      return WalletException(
        'Connection cancelled. Tap again to retry.',
        kind: WalletExceptionKind.userCancelled,
      );
    }
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
        'Wallet declined to authorize. Try a different wallet, or make sure '
        'the wallet you tapped has a Solana account set up.',
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
