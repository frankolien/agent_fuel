import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// State that has to survive the connect → sign roundtrip. The auth token
/// store handles the user-visible wallet identity (pubkey, session label);
/// this store holds the crypto material needed to encrypt the next request
/// to Phantom and decrypt its response.
///
/// We persist the dapp's X25519 private key seed rather than a precomputed
/// shared secret — pinenacl 0.6's `Box` doesn't expose the precomputed key
/// publicly, and X25519 derivation is microseconds, so there's no point
/// caching it.
typedef PhantomSession = ({
  String session,
  String dappPrivateKeyBase58,
  String phantomPubkeyBase58,
});

class PhantomSessionStore {
  PhantomSessionStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const _kSession = 'af_phantom_session';
  static const _kDappPrivateKey = 'af_phantom_dapp_privkey_b58';
  static const _kPhantomPubkey = 'af_phantom_pubkey_b58';

  final FlutterSecureStorage _storage;

  Future<void> save({
    required String session,
    required String dappPrivateKeyBase58,
    required String phantomPubkeyBase58,
  }) async {
    await _storage.write(key: _kSession, value: session);
    await _storage.write(key: _kDappPrivateKey, value: dappPrivateKeyBase58);
    await _storage.write(key: _kPhantomPubkey, value: phantomPubkeyBase58);
  }

  Future<PhantomSession?> read() async {
    final session = await _storage.read(key: _kSession);
    final privkey = await _storage.read(key: _kDappPrivateKey);
    final phantomPubkey = await _storage.read(key: _kPhantomPubkey);
    if (session == null || privkey == null || phantomPubkey == null) return null;
    return (
      session: session,
      dappPrivateKeyBase58: privkey,
      phantomPubkeyBase58: phantomPubkey,
    );
  }

  Future<void> clear() async {
    await _storage.delete(key: _kSession);
    await _storage.delete(key: _kDappPrivateKey);
    await _storage.delete(key: _kPhantomPubkey);
  }
}
