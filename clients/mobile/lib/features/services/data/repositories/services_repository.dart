import 'package:dio/dio.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/network/api_endpoint.dart';
import '../../domain/entities/service.dart';

class ServicesRepository {
  ServicesRepository(this._dio);
  final Dio _dio;

  Future<List<Service>> list() async {
    try {
      final resp = await _dio.get<List<dynamic>>(ApiEndpoint.services);
      final raw = resp.data ?? const [];
      return raw
          .whereType<Map<String, dynamic>>()
          .map(Service.fromJson)
          .toList(growable: false);
    } on DioException catch (e) {
      final wrapped = e.error;
      if (wrapped is ServerException || wrapped is NetworkException) rethrow;
      throw NetworkException(e.message ?? 'Failed to load services');
    }
  }
}
