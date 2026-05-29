import 'package:flutter_secure_storage/flutter_secure_storage.dart';

typedef CachedWallet = ({
  String authToken,
  String pubkey,
  String? walletUri,
  String? accountLabel,
});

class AuthTokenStore {
  AuthTokenStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const _kAuthToken = 'af_wallet_auth_token';
  static const _kPubkey = 'af_wallet_pubkey_b58';
  static const _kWalletUri = 'af_wallet_uri_base';
  static const _kAccountLabel = 'af_wallet_account_label';

  final FlutterSecureStorage _storage;

  Future<void> save({
    required String authToken,
    required String pubkeyBase58,
    String? walletUriBase,
    String? accountLabel,
  }) async {
    await _storage.write(key: _kAuthToken, value: authToken);
    await _storage.write(key: _kPubkey, value: pubkeyBase58);
    await _storage.write(key: _kWalletUri, value: walletUriBase);
    await _storage.write(key: _kAccountLabel, value: accountLabel);
  }

  Future<CachedWallet?> read() async {
    final token = await _storage.read(key: _kAuthToken);
    final pubkey = await _storage.read(key: _kPubkey);
    if (token == null || pubkey == null) return null;
    return (
      authToken: token,
      pubkey: pubkey,
      walletUri: await _storage.read(key: _kWalletUri),
      accountLabel: await _storage.read(key: _kAccountLabel),
    );
  }

  Future<void> clear() async {
    await _storage.delete(key: _kAuthToken);
    await _storage.delete(key: _kPubkey);
    await _storage.delete(key: _kWalletUri);
    await _storage.delete(key: _kAccountLabel);
  }
}
