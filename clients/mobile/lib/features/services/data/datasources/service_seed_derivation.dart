import 'dart:convert';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart' show Hmac, SecretKey;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:solana/base58.dart' show base58decode, base58encode;
import 'package:solana/solana.dart' show Ed25519HDKeyPair;

import '../../../wallet/data/repositories/wallet_repository.dart';

/// Wallet-derived service seeds. Same shape as [AgentSeedDerivation] but
/// with a distinct HMAC context, so service[0] and agent[0] derive to
/// different keypairs even from the same wallet master signature. We
/// reuse the cached master signature when the user has already signed it
/// for agents — no second prompt.
class ServiceSeedDerivation {
  ServiceSeedDerivation(this._wallet, {FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const _masterMessage = 'Agent Fuel · v1 · derive agent seeds';
  static const _hmacContext = 'agent-fuel:service-seed:v1';
  static const _kMasterSigPrefix = 'af_master_sig:';

  final WalletRepository _wallet;
  final FlutterSecureStorage _storage;
  final _hmac = Hmac.sha256();

  Future<Uint8List> seedForIndex({
    required String ownerPubkey,
    required String walletAuthToken,
    required int index,
  }) async {
    final masterSig =
        await _getOrFetchMasterSig(ownerPubkey, walletAuthToken);
    return _derive(masterSig, index);
  }

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

  List<int> _u32Le(int v) {
    final b = ByteData(4)..setUint32(0, v, Endian.little);
    return b.buffer.asUint8List();
  }
}
