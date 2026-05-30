import 'package:dio/dio.dart';

import '../../core/network/api_endpoint.dart';
import '../../core/network/dio_client.dart';

/// Dev-only: asks the backend to mint dev USDC to the caller's wallet.
/// Returns null on success. Throws [DevAirdropException] with a friendly
/// message otherwise; the most common failures are:
///   - 404 Not Found  → backend was not started with the mint-authority env
///   - 502 Bad Gateway → RPC blip; tell the user to try again
///
/// Mobile UI surfaces this when an on-chain deposit fails with
/// "insufficient funds" so the user can self-serve USDC in one tap.
class DevAirdropService {
  DevAirdropService(this._dio);
  final DioClient _dio;

  static const int defaultUsdc = 1000;

  Future<DevAirdropResult> airdrop({
    required String walletPubkeyBase58,
    int amountUsdc = defaultUsdc,
  }) async {
    try {
      final resp = await _dio.dio.post<Map<String, dynamic>>(
        ApiEndpoint.devAirdrop,
        data: {
          'wallet': walletPubkeyBase58,
          'amount_usdc': amountUsdc,
        },
      );
      final data = resp.data!;
      return DevAirdropResult(
        signature: data['signature'] as String,
        recipientAta: data['recipient_ata'] as String,
        mint: data['mint'] as String,
        amountMintedMicro: (data['amount_minted_micro'] as num).toInt(),
      );
    } on DioException catch (e) {
      throw DevAirdropException(_mapError(e));
    }
  }

  String _mapError(DioException e) {
    final code = e.response?.statusCode;
    if (code == 404) {
      return 'Dev airdrop is disabled on this backend. Ask the operator to set '
          'AGENT_FUEL_USDC_MINT_AUTHORITY_PATH, or top up the wallet manually.';
    }
    final body = e.response?.data;
    if (body is Map && body['error'] is String) {
      return body['error'] as String;
    }
    return e.message ?? 'Airdrop request failed.';
  }
}

class DevAirdropResult {
  const DevAirdropResult({
    required this.signature,
    required this.recipientAta,
    required this.mint,
    required this.amountMintedMicro,
  });
  final String signature;
  final String recipientAta;
  final String mint;
  final int amountMintedMicro;

  int get amountUsdc => amountMintedMicro ~/ 1000000;
}

class DevAirdropException implements Exception {
  DevAirdropException(this.message);
  final String message;
  @override
  String toString() => message;
}
