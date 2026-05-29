import 'package:dio/dio.dart';

import '../../features/auth/data/datasources/jwt_store.dart';
import '../config/env.dart';
import '../error/exceptions.dart';

class DioClient {
  DioClient(this._jwtStore)
      : _dio = Dio(
          BaseOptions(
            baseUrl: AppEnv.apiBase,
            connectTimeout: const Duration(seconds: 10),
            receiveTimeout: const Duration(seconds: 15),
            contentType: 'application/json',
            responseType: ResponseType.json,
          ),
        ) {
    _dio.interceptors.add(_AuthInterceptor(_jwtStore));
    _dio.interceptors.add(_ErrorInterceptor());
  }

  final Dio _dio;
  final JwtStore _jwtStore;
  Dio get dio => _dio;
}

class _AuthInterceptor extends Interceptor {
  _AuthInterceptor(this._store);
  final JwtStore _store;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (!_isAnonymous(options.path)) {
      final cached = await _store.read();
      if (cached != null) {
        options.headers['Authorization'] = 'Bearer ${cached.token}';
      }
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    if (err.response?.statusCode == 401) {
      await _store.clear();
    }
    handler.next(err);
  }

  bool _isAnonymous(String path) =>
      path.startsWith('/auth/nonce') || path.startsWith('/auth/verify');
}

class _ErrorInterceptor extends Interceptor {
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final response = err.response;
    if (response != null) {
      if (response.statusCode == 404) {
        handler.reject(
          DioException(
            requestOptions: err.requestOptions,
            error: NotFoundException(response.statusMessage ?? 'Not found'),
            response: response,
          ),
        );
        return;
      }
      handler.reject(
        DioException(
          requestOptions: err.requestOptions,
          error: ServerException(
            response.statusMessage ?? 'Server error',
            statusCode: response.statusCode,
          ),
          response: response,
        ),
      );
      return;
    }
    handler.reject(
      DioException(
        requestOptions: err.requestOptions,
        error: NetworkException(err.message ?? 'Network unavailable'),
      ),
    );
  }
}
