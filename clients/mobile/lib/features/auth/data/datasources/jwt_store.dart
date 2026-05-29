import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class JwtStore {
  JwtStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const _kToken = 'af_siws_jwt';
  static const _kExpiresAt = 'af_siws_jwt_expires_at';

  final FlutterSecureStorage _storage;

  Future<void> save({required String token, required DateTime expiresAt}) async {
    await _storage.write(key: _kToken, value: token);
    await _storage.write(key: _kExpiresAt, value: expiresAt.toIso8601String());
  }

  Future<({String token, DateTime expiresAt})?> read() async {
    final token = await _storage.read(key: _kToken);
    final expiresAtRaw = await _storage.read(key: _kExpiresAt);
    if (token == null || expiresAtRaw == null) return null;
    final expiresAt = DateTime.tryParse(expiresAtRaw);
    if (expiresAt == null) return null;
    return (token: token, expiresAt: expiresAt);
  }

  Future<void> clear() async {
    await _storage.delete(key: _kToken);
    await _storage.delete(key: _kExpiresAt);
  }
}
