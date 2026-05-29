import 'package:dio/dio.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/network/api_endpoint.dart';
import '../models/agent_model.dart';

/// Talks to `GET /api/agents`. Throws `ServerException` / `NetworkException`
/// on failure — the repository translates those into `Failure`s.
abstract class FleetRemoteDataSource {
  Future<List<AgentModel>> listAgents({String? ownerPubkey});
}

class FleetRemoteDataSourceImpl implements FleetRemoteDataSource {
  FleetRemoteDataSourceImpl(this._dio);
  final Dio _dio;

  @override
  Future<List<AgentModel>> listAgents({String? ownerPubkey}) async {
    try {
      final res = await _dio.get<List<dynamic>>(
        ApiEndpoint.agents,
        queryParameters: ownerPubkey == null ? null : {'owner': ownerPubkey},
      );
      return (res.data ?? const [])
          .map((e) => AgentModel.fromJson(e as Map<String, dynamic>))
          .toList(growable: false);
    } on DioException catch (e) {
      // The interceptor in `DioClient` has already wrapped these into our
      // exception types — just rethrow the underlying error.
      final inner = e.error;
      if (inner is ServerException || inner is NetworkException) throw inner!;
      throw ServerException(e.message ?? 'Unknown error');
    }
  }
}
