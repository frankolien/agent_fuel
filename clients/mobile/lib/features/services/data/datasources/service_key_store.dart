import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:solana/base58.dart' show base58decode, base58encode;
import 'package:solana/solana.dart' show Ed25519HDPublicKey;

/// Secure-storage vault for service keypairs the user has registered. The
/// service keypair signs `record_payment` (no funds at risk — losing it
/// just means that service can't accrue reputation until re-registered)
/// and `set_service_active`. We persist the 32-byte ed25519 seed keyed by
/// the service's base58 pubkey plus an index list so the app can list
/// every service it controls. Mirrors `AgentKeyStore`.
class ServiceKeyStore {
  ServiceKeyStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const _kPrefix = 'af_service_seed:';
  static const _kIndex = 'af_service_index_v1';

  final FlutterSecureStorage _storage;

  Future<void> save({
    required String servicePubkey,
    required Uint8List seedBytes,
  }) async {
    assert(seedBytes.length == 32, 'ed25519 seed must be 32 bytes');
    await _storage.write(
      key: _kPrefix + servicePubkey,
      value: base58encode(seedBytes),
    );
    final existing = await _readIndex();
    if (!existing.contains(servicePubkey)) {
      await _storage.write(
        key: _kIndex,
        value: jsonEncode([...existing, servicePubkey]),
      );
    }
  }

  Future<Uint8List?> readSeed(String servicePubkey) async {
    final raw = await _storage.read(key: _kPrefix + servicePubkey);
    if (raw == null) return null;
    return Uint8List.fromList(base58decode(raw));
  }

  Future<List<int>?> readSolanaSecret(String servicePubkey) async {
    final seed = await readSeed(servicePubkey);
    if (seed == null) return null;
    final pubkey = Ed25519HDPublicKey.fromBase58(servicePubkey).bytes;
    return [...seed, ...pubkey];
  }

  Future<List<String>> listServices() => _readIndex();

  Future<bool> has(String servicePubkey) async =>
      (await _storage.read(key: _kPrefix + servicePubkey)) != null;

  Future<void> delete(String servicePubkey) async {
    await _storage.delete(key: _kPrefix + servicePubkey);
    final existing = await _readIndex();
    final updated = existing.where((p) => p != servicePubkey).toList();
    await _storage.write(key: _kIndex, value: jsonEncode(updated));
  }

  Future<List<String>> _readIndex() async {
    final raw = await _storage.read(key: _kIndex);
    if (raw == null || raw.isEmpty) return const [];
    try {
      return (jsonDecode(raw) as List).cast<String>();
    } catch (_) {
      return const [];
    }
  }
}
