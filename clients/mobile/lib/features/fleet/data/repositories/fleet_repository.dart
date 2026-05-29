import 'package:dio/dio.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/network/api_endpoint.dart';
import '../../domain/entities/agent.dart';

class FleetRepository {
  FleetRepository(this._dio);
  final Dio _dio;

  Future<List<Agent>> listAgents({String? ownerPubkey}) async {
    try {
      final res = await _dio.get<List<dynamic>>(
        ApiEndpoint.agents,
        queryParameters: ownerPubkey == null ? null : {'owner': ownerPubkey},
      );
      return (res.data ?? const [])
          .map((e) => Agent.fromJson(e as Map<String, dynamic>))
          .toList(growable: false);
    } on NotFoundException {
      return const [];
    } on DioException catch (e) {
      final inner = e.error;
      if (inner is ServerException) throw inner;
      if (inner is NetworkException) throw inner;
      throw ServerException(e.message ?? 'Unknown error');
    }
  }
}
