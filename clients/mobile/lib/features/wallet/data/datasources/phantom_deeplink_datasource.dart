import 'dart:async';
import 'dart:convert' show jsonDecode, utf8;
import 'dart:io' show Platform;
import 'dart:typed_data' show Uint8List;

import 'package:app_links/app_links.dart';
import 'package:pinenacl/x25519.dart'
    show Box, EncryptedMessage, PrivateKey, PublicKey;
import 'package:solana/base58.dart' show base58decode, base58encode;
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/config/env.dart';
import '../../../../core/error/exceptions.dart';
import 'mwa_datasource.dart' show MwaResult;
import 'phantom_session_store.dart';

/// iOS counterpart to [MwaDataSource]. Implements Phantom's Deeplinks
/// `connect` flow:
///
///   1. Generate an ephemeral X25519 keypair (the "dapp keypair").
///   2. Launch `https://phantom.app/ul/v1/connect` with our pubkey and a
///      redirect back into the app via the `agentfuel://` scheme.
///   3. Phantom returns to `agentfuel://onPhantomConnect` with its own
///      X25519 pubkey, a 24-byte nonce, and the user's pubkey + session
///      token encrypted with NaCl `box`.
///   4. Decrypt with the shared secret, persist the session + secret for
///      future sign requests, and surface the user's wallet pubkey.
///
/// Phantom's deeplinks spec:
///   https://docs.phantom.com/phantom-deeplinks/provider-methods/connect
///
/// `signMessage` / `signAndSendTransaction` follow the same handshake
/// pattern with encrypted payloads. They land in a follow-up — the
/// session + shared secret persisted here are exactly what those calls
/// will need to reauthenticate without bouncing through `connect` again.
class PhantomDeeplinkDataSource {
  PhantomDeeplinkDataSource({
    required PhantomSessionStore sessionStore,
    AppLinks? appLinks,
  })  : _sessionStore = sessionStore,
        _appLinks = appLinks ?? AppLinks();

  static const _connectUri = 'https://phantom.app/ul/v1/connect';
  static const _connectRedirectHost = 'onPhantomConnect';
  static const _connectTimeout = Duration(minutes: 5);

  final PhantomSessionStore _sessionStore;
  final AppLinks _appLinks;

  Future<MwaResult> authorize() async {
    _ensureIos();

    // Ephemeral X25519 keypair — never stored. Only the derived shared
    // secret is kept (see PhantomSessionStore).
    final dapp = PrivateKey.generate();
    final dappPubkeyB58 = base58encode(Uint8List.fromList(dapp.publicKey));

    final redirect = Uri(
      scheme: AppEnv.deepLinkScheme,
      host: _connectRedirectHost,
    );

    final connectUrl = Uri.parse(_connectUri).replace(queryParameters: {
      'app_url': AppEnv.identityUri,
      'dapp_encryption_public_key': dappPubkeyB58,
      'redirect_link': redirect.toString(),
      'cluster': AppEnv.cluster,
    });

    // Subscribe BEFORE launching — if Phantom returns instantly (rare but
    // possible with the device unlocked + an active session) we'd otherwise
    // miss the event.
    final completer = Completer<Uri>();
    final subscription = _appLinks.uriLinkStream.listen((uri) {
      if (uri.scheme == AppEnv.deepLinkScheme && uri.host == _connectRedirectHost) {
        if (!completer.isCompleted) completer.complete(uri);
      }
    });

    try {
      final launched = await launchUrl(
        connectUrl,
        mode: LaunchMode.externalApplication,
      );
      if (!launched) {
        throw WalletException(
          'No Solana wallet found on this device. Install Phantom from the '
          'App Store, then try again.',
          kind: WalletExceptionKind.noWalletInstalled,
        );
      }

      final returnUri = await completer.future.timeout(
        _connectTimeout,
        onTimeout: () => throw WalletException(
          'Phantom didn\'t return within 5 minutes. Tap connect again to retry.',
          kind: WalletExceptionKind.userCancelled,
        ),
      );

      return await _decodeConnectReturn(returnUri, dapp);
    } finally {
      await subscription.cancel();
    }
  }

  Future<MwaResult> _decodeConnectReturn(Uri returnUri, PrivateKey dapp) async {
    final params = returnUri.queryParameters;

    // Phantom signals failure with `errorCode` + `errorMessage`. We surface
    // both verbatim — the codes aren't stable enough to branch on, and
    // Phantom's messages are already user-shaped.
    final errorCode = params['errorCode'];
    final errorMessage = params['errorMessage'];
    if (errorCode != null || errorMessage != null) {
      throw WalletException(
        errorMessage ?? 'Phantom returned error $errorCode',
        kind: errorCode == '4001'
            ? WalletExceptionKind.userCancelled
            : WalletExceptionKind.protocol,
      );
    }

    final phantomPubkeyB58 = params['phantom_encryption_public_key'];
    final nonceB58 = params['nonce'];
    final dataB58 = params['data'];
    if (phantomPubkeyB58 == null || nonceB58 == null || dataB58 == null) {
      throw WalletException(
        'Phantom returned an unexpected response. Try connecting again.',
        kind: WalletExceptionKind.protocol,
      );
    }

    final phantomPubkey = PublicKey(Uint8List.fromList(base58decode(phantomPubkeyB58)));
    final box = Box(myPrivateKey: dapp, theirPublicKey: phantomPubkey);

    final nonce = Uint8List.fromList(base58decode(nonceB58));
    final cipher = Uint8List.fromList(base58decode(dataB58));

    final Uint8List plaintext;
    try {
      plaintext = box.decrypt(EncryptedMessage(nonce: nonce, cipherText: cipher));
    } catch (_) {
      throw WalletException(
        'Failed to decrypt Phantom\'s response. Tap connect again to retry.',
        kind: WalletExceptionKind.protocol,
      );
    }

    final Map<String, dynamic> payload;
    try {
      payload = jsonDecode(utf8.decode(plaintext)) as Map<String, dynamic>;
    } catch (_) {
      throw WalletException(
        'Phantom returned an unexpected response body.',
        kind: WalletExceptionKind.protocol,
      );
    }

    final publicKey = payload['public_key'];
    final session = payload['session'];
    if (publicKey is! String || session is! String) {
      throw WalletException(
        'Phantom returned an incomplete handshake. Try again.',
        kind: WalletExceptionKind.protocol,
      );
    }

    // Persist the dapp privkey rather than a precomputed shared secret —
    // pinenacl 0.6's `Box` doesn't expose the inner key publicly, and X25519
    // derivation is microseconds, so caching buys nothing.
    await _sessionStore.save(
      session: session,
      dappPrivateKeyBase58: base58encode(Uint8List.fromList(dapp)),
      phantomPubkeyBase58: phantomPubkeyB58,
    );

    return MwaResult(
      authToken: session,
      pubkeyBase58: publicKey,
      accountLabel: 'Phantom',
    );
  }

  Future<void> deauthorize() async {
    await _sessionStore.clear();
  }

  void _ensureIos() {
    if (!Platform.isIOS) {
      throw WalletException(
        'Phantom Deeplinks is iOS-only',
        kind: WalletExceptionKind.unsupportedPlatform,
      );
    }
  }
}
