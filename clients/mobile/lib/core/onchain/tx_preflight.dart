import 'dart:convert' show base64Encode;

import 'package:solana/solana.dart' show RpcClient;

import '../config/env.dart';

/// Thrown when an on-chain tx fails pre-flight simulation. Carries the
/// program-log lines the on-chain runtime emitted before reverting —
/// exactly what mainstream wallets hide behind "Something went wrong" /
/// "Unknown error has occurred while processing instructions."
class OnchainSimulationException implements Exception {
  OnchainSimulationException({required this.message, required this.logs});
  final String message;
  final List<String> logs;
  @override
  String toString() => message;
}

/// Pre-flight simulator. Single source of truth for every on-chain action
/// the mobile app submits — provisioning, fund, withdraw, approve, etc.
/// Without this, every failure looks identical from the user's side.
class TxPreflight {
  TxPreflight({RpcClient? rpc}) : _rpc = rpc ?? RpcClient(AppEnv.rpcUrl);

  final RpcClient _rpc;

  /// Simulates with sigVerify off (the tx may only be partially signed)
  /// and a replaced recent blockhash (the caller's blockhash may have
  /// drifted). Throws [OnchainSimulationException] if the simulator
  /// reports an `err`; returns normally on success.
  Future<void> check(List<int> txBytes) async {
    final res = await _rpc.simulateTransaction(
      base64Encode(txBytes),
      sigVerify: false,
      replaceRecentBlockhash: true,
    );
    final status = res.value;
    if (status.err == null) return;
    final logs = status.logs ?? const <String>[];
    throw OnchainSimulationException(
      message: _summarize(status.err, logs),
      logs: logs,
    );
  }

  String _summarize(Object? err, List<String> logs) {
    // Anchor errors usually appear as a "Program log: AnchorError ..." line.
    // Surface that line if we can find it; fall back to the raw err object.
    final anchorLine = logs.reversed.firstWhere(
      (l) => l.contains('AnchorError') || l.contains('Error Message:'),
      orElse: () => '',
    );
    if (anchorLine.isNotEmpty) {
      return anchorLine.replaceFirst('Program log: ', '').trim();
    }
    final lastFail = logs.reversed.firstWhere(
      (l) => l.toLowerCase().contains('failed') || l.contains('Error'),
      orElse: () => '',
    );
    if (lastFail.isNotEmpty) {
      return lastFail.replaceFirst('Program log: ', '').trim();
    }
    return 'On-chain simulation failed: $err';
  }
}
