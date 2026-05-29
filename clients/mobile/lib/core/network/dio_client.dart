import 'dart:io' show SocketException;

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
            _serverMessage(err, response),
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
        error: NetworkException(_friendly(err)),
      ),
    );
  }

  String _serverMessage(DioException err, Response<dynamic> response) {
    final body = response.data;
    String? extracted;
    if (body is String && body.isNotEmpty) {
      extracted = body;
    } else if (body is Map && body['message'] is String) {
      extracted = body['message'] as String;
    } else if (body is Map && body['error'] is String) {
      extracted = body['error'] as String;
    }
    final code = response.statusCode;
    final reason = response.statusMessage ?? 'Server error';
    final path = err.requestOptions.path;
    final detail = extracted == null ? '' : ' — $extracted';
    return '$code $reason on $path$detail';
  }

  String _friendly(DioException err) {
    final inner = err.error;
    final host = err.requestOptions.uri.host;

    if (inner is SocketException) {
      final msg = inner.message.toLowerCase();
      if (msg.contains('failed host lookup') ||
          msg.contains('no address associated')) {
        return 'Can\'t reach $host — your device couldn\'t resolve the '
            'address. Check that you\'re online and that DNS is working, '
            'then try again.';
      }
      if (msg.contains('connection refused')) {
        return '$host refused the connection. The server may be down or '
            'restarting — try again in a minute.';
      }
      if (msg.contains('network is unreachable') ||
          msg.contains('no route to host')) {
        return 'Your device says the network is unreachable. Switch '
            'between Wi-Fi and cellular and try again.';
      }
    }

    switch (err.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return '$host took too long to respond. Try again — the server '
            'may be warming up.';
      case DioExceptionType.badCertificate:
        return 'Couldn\'t verify the secure connection to $host. Check '
            'the device clock and try again.';
      case DioExceptionType.connectionError:
        return 'Couldn\'t reach $host. Check the connection and try again.';
      case DioExceptionType.cancel:
        return 'Request cancelled.';
      case DioExceptionType.badResponse:
      case DioExceptionType.unknown:
        return err.message ?? 'Network unavailable';
    }
  }
}
