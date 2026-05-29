import 'package:dio/dio.dart';

import '../config/env.dart';
import '../error/exceptions.dart';

/// Single Dio instance shared by every remote datasource. Centralizing here
/// keeps base URL + timeouts + interceptors in one place.
class DioClient {
  DioClient()
      : _dio = Dio(
          BaseOptions(
            baseUrl: AppEnv.apiBase,
            connectTimeout: const Duration(seconds: 10),
            receiveTimeout: const Duration(seconds: 15),
            contentType: 'application/json',
            responseType: ResponseType.json,
          ),
        ) {
    _dio.interceptors.add(_ErrorInterceptor());
  }

  final Dio _dio;
  Dio get dio => _dio;
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
