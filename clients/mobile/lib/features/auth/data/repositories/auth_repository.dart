import 'package:dio/dio.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/network/api_endpoint.dart';
import '../../domain/entities/siws_session.dart';
import '../datasources/jwt_store.dart';

class NonceChallenge {
  const NonceChallenge({required this.nonce, required this.message});
  final String nonce;
  final String message;
}

class AuthRepository {
  AuthRepository(this._dio, this._store);

  final Dio _dio;
  final JwtStore _store;

  Future<NonceChallenge> requestNonce(String pubkeyBase58) async {
    final body = await _post(ApiEndpoint.authNonce, {'pubkey': pubkeyBase58});
    return NonceChallenge(
      nonce: body['nonce'] as String,
      message: body['message'] as String,
    );
  }

  Future<SiwsSession> verify({
    required String pubkeyBase58,
    required String nonce,
    required String signatureBase58,
  }) async {
    final body = await _post(ApiEndpoint.authVerify, {
      'pubkey': pubkeyBase58,
      'nonce': nonce,
      'signature': signatureBase58,
    });
    final session = SiwsSession(
      token: body['token'] as String,
      expiresAt: DateTime.parse(body['expires_at'] as String),
    );
    await _store.save(token: session.token, expiresAt: session.expiresAt);
    return session;
  }

  Future<SiwsSession?> cachedSession() async {
    final cached = await _store.read();
    if (cached == null) return null;
    return SiwsSession(token: cached.token, expiresAt: cached.expiresAt);
  }

  Future<void> clearSession() => _store.clear();

  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> data) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(path, data: data);
      return res.data ?? const {};
    } on DioException catch (e) {
      final inner = e.error;
      if (inner is ServerException) throw inner;
      if (inner is NetworkException) throw inner;
      throw ServerException(e.message ?? 'Unknown error');
    }
  }
}
