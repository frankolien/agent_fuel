import 'dart:convert';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart' show Hmac, SecretKey;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:solana/base58.dart' show base58decode, base58encode;
import 'package:solana/solana.dart' show Ed25519HDKeyPair;

import '../../../wallet/data/repositories/wallet_repository.dart';

/// Wallet-derived agent seeds.
///
/// The user signs ONE fixed message with their wallet ("master signature").
/// Every agent seed is then `HMAC-SHA256(master_sig, "...|index_u32_le")[..32]`,
/// where `index` is the wallet-scoped agent ordinal (0, 1, 2…). The master
/// signature lives in secure storage so we only prompt once per wallet.
///
/// Two consequences worth noting:
/// 1. Cross-device recovery: reinstall the app, reconnect the same wallet,
///    re-sign the master message → same signature → same seeds → same
///    agents. No backup file to lose.
/// 2. Determinism assumption: every mainstream MWA wallet (Phantom,
///    Solflare, Backpack, Seed Vault) implements RFC 8032 ed25519, which
///    is deterministic — `sign(privkey, msg)` always returns the same
///    signature. If a wallet ever randomizes, recovery breaks for that
///    wallet only. The legacy random-seed orphan path still catches it.
class AgentSeedDerivation {
  AgentSeedDerivation(this._wallet, {FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const _masterMessage = 'Agent Fuel · v1 · derive agent seeds';
  static const _hmacContext = 'agent-fuel:agent-seed:v1';
  static const _kMasterSigPrefix = 'af_master_sig:';

  final WalletRepository _wallet;
  final FlutterSecureStorage _storage;
  final _hmac = Hmac.sha256();

  /// Returns true if this wallet has already produced a master signature on
  /// this device — so we know whether the next [seedForIndex] call needs to
  /// prompt the user.
  Future<bool> hasMasterSig(String ownerPubkey) async =>
      (await _storage.read(key: _kMasterSigPrefix + ownerPubkey)) != null;

  /// Derives the seed for `index` under `ownerPubkey`. Prompts the wallet
  /// to sign the master message the first time (per wallet, per device);
  /// silent on every subsequent call.
  Future<Uint8List> seedForIndex({
    required String ownerPubkey,
    required String walletAuthToken,
    required int index,
  }) async {
    final masterSig =
        await _getOrFetchMasterSig(ownerPubkey, walletAuthToken);
    return _derive(masterSig, index);
  }

  /// Pubkey of the agent that would be derived at `index` under
  /// `ownerPubkey`. Used by the recovery sweep to test indices without
  /// constructing a full keypair every time.
  Future<String> pubkeyForIndex({
    required String ownerPubkey,
    required String walletAuthToken,
    required int index,
  }) async {
    final seed = await seedForIndex(
      ownerPubkey: ownerPubkey,
      walletAuthToken: walletAuthToken,
      index: index,
    );
    final kp = await Ed25519HDKeyPair.fromPrivateKeyBytes(privateKey: seed);
    return kp.publicKey.toBase58();
  }

  /// Forgets the cached master signature so the next derivation re-prompts.
  /// Call on wallet disconnect.
  Future<void> forget(String ownerPubkey) =>
      _storage.delete(key: _kMasterSigPrefix + ownerPubkey);

  Future<Uint8List> _getOrFetchMasterSig(
    String ownerPubkey,
    String walletAuthToken,
  ) async {
    final cached = await _storage.read(key: _kMasterSigPrefix + ownerPubkey);
    if (cached != null) {
      return Uint8List.fromList(base58decode(cached));
    }
    final sig = await _wallet.signMessage(
      authToken: walletAuthToken,
      pubkeyBase58: ownerPubkey,
      message: Uint8List.fromList(utf8.encode(_masterMessage)),
    );
    await _storage.write(
      key: _kMasterSigPrefix + ownerPubkey,
      value: base58encode(sig),
    );
    return sig;
  }

  Future<Uint8List> _derive(Uint8List masterSig, int index) async {
    final info = BytesBuilder()
      ..add(utf8.encode(_hmacContext))
      ..addByte(0x7C) // '|'
      ..add(_u32Le(index));
    final mac = await _hmac.calculateMac(
      info.toBytes(),
      secretKey: SecretKey(masterSig),
    );
    return Uint8List.fromList(mac.bytes);
  }

  List<int> _u32Le(int v) {
    final b = ByteData(4)..setUint32(0, v, Endian.little);
    return b.buffer.asUint8List();
  }

  /// Useful for the recovery sweep: derive a batch of pubkeys 0..count-1 in
  /// one go without re-fetching the master signature.
  Future<List<({int index, String pubkey, Uint8List seed})>> deriveBatch({
    required String ownerPubkey,
    required String walletAuthToken,
    required int count,
  }) async {
    final masterSig =
        await _getOrFetchMasterSig(ownerPubkey, walletAuthToken);
    final out = <({int index, String pubkey, Uint8List seed})>[];
    for (var i = 0; i < count; i++) {
      final seed = await _derive(masterSig, i);
      final kp = await Ed25519HDKeyPair.fromPrivateKeyBytes(privateKey: seed);
      out.add((index: i, pubkey: kp.publicKey.toBase58(), seed: seed));
    }
    return out;
  }
}
