import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:solana/base58.dart' show base58decode, base58encode;
import 'package:solana/solana.dart' show Ed25519HDPublicKey;

/// Secure-storage vault for ephemeral agent keypairs created during
/// onboarding. The owner's wallet (Phantom/Solflare/etc.) is never the
/// signer for `spend` — Anchor wires `agent` as the signer of `spend`,
/// `request_spend`, and `claim`. The keypair we generate inside
/// `AgentProvisioningService` is therefore load-bearing: lose it and you
/// lose every future spend by that agent. We persist the 32-byte ed25519
/// seed here keyed by the agent's base58 pubkey, plus an index list so the
/// app can enumerate every agent it controls.
class AgentKeyStore {
  AgentKeyStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const _kPrefix = 'af_agent_seed:';
  static const _kIndex = 'af_agent_index_v1';

  final FlutterSecureStorage _storage;

  Future<void> save({
    required String agentPubkey,
    required Uint8List seedBytes,
  }) async {
    assert(seedBytes.length == 32, 'ed25519 seed must be 32 bytes');
    await _storage.write(
      key: _kPrefix + agentPubkey,
      value: base58encode(seedBytes),
    );
    final existing = await _readIndex();
    if (!existing.contains(agentPubkey)) {
      await _storage.write(
        key: _kIndex,
        value: jsonEncode([...existing, agentPubkey]),
      );
    }
  }

  Future<Uint8List?> readSeed(String agentPubkey) async {
    final raw = await _storage.read(key: _kPrefix + agentPubkey);
    if (raw == null) return null;
    return Uint8List.fromList(base58decode(raw));
  }

  /// Solana's "secret key JSON array" format — 64 bytes = [seed || pubkey].
  /// What `solana-keygen` writes and what every agent runtime
  /// (solana-agent-kit, eliza, custom) imports.
  Future<List<int>?> readSolanaSecret(String agentPubkey) async {
    final seed = await readSeed(agentPubkey);
    if (seed == null) return null;
    final pubkey = Ed25519HDPublicKey.fromBase58(agentPubkey).bytes;
    return [...seed, ...pubkey];
  }

  Future<List<String>> listAgents() => _readIndex();

  Future<bool> has(String agentPubkey) async {
    final raw = await _storage.read(key: _kPrefix + agentPubkey);
    return raw != null;
  }

  Future<void> delete(String agentPubkey) async {
    await _storage.delete(key: _kPrefix + agentPubkey);
    final existing = await _readIndex();
    final updated = existing.where((p) => p != agentPubkey).toList();
    await _storage.write(key: _kIndex, value: jsonEncode(updated));
  }

  Future<List<String>> _readIndex() async {
    final raw = await _storage.read(key: _kIndex);
    if (raw == null || raw.isEmpty) return const [];
    try {
      final list = (jsonDecode(raw) as List).cast<String>();
      return list;
    } catch (_) {
      return const [];
    }
  }
}
