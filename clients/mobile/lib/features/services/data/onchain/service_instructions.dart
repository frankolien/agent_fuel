import 'dart:convert';
import 'dart:typed_data';

import 'package:solana/encoder.dart';
import 'package:solana/solana.dart';

import '../../../../core/config/env.dart';

// sha256("global:register_service")[..8]
const _registerServiceDiscriminator = <int>[11, 133, 158, 232, 193, 19, 229, 73];

const _serviceSeed = <int>[115, 101, 114, 118, 105, 99, 101]; // "service"

class ServiceRegistryAccounts {
  ServiceRegistryAccounts({
    required this.sponsor,
    required this.service,
    required this.registry,
  });

  final Ed25519HDPublicKey sponsor;
  final Ed25519HDPublicKey service;
  final Ed25519HDPublicKey registry;
}

Future<ServiceRegistryAccounts> deriveServiceAccounts({
  required Ed25519HDPublicKey sponsor,
  required Ed25519HDPublicKey service,
}) async {
  final reputationProgram =
      Ed25519HDPublicKey.fromBase58(AppEnv.reputationProgramId);
  final registry = await Ed25519HDPublicKey.findProgramAddress(
    seeds: [_serviceSeed, service.bytes],
    programId: reputationProgram,
  );
  return ServiceRegistryAccounts(
    sponsor: sponsor,
    service: service,
    registry: registry,
  );
}

/// Mirrors `programs/reputation/src/instructions/register_service.rs`.
/// Data layout: 8 disc + 32 name + 1 category + 128 uri.
Instruction registerServiceIx({
  required ServiceRegistryAccounts accounts,
  required Uint8List name32,
  required int categoryOnchain,
  required Uint8List uri128,
}) {
  assert(name32.length == 32, 'name must be exactly 32 bytes');
  assert(uri128.length == 128, 'uri must be exactly 128 bytes');
  final data = BytesBuilder()
    ..add(_registerServiceDiscriminator)
    ..add(name32)
    ..addByte(categoryOnchain)
    ..add(uri128);
  return Instruction(
    programId: Ed25519HDPublicKey.fromBase58(AppEnv.reputationProgramId),
    accounts: [
      AccountMeta.writeable(pubKey: accounts.sponsor, isSigner: true),
      AccountMeta.readonly(pubKey: accounts.service, isSigner: true),
      AccountMeta.writeable(pubKey: accounts.registry, isSigner: false),
      AccountMeta.readonly(pubKey: SystemProgram.id, isSigner: false),
    ],
    data: ByteArray(data.toBytes()),
  );
}

/// Pad a string into a fixed-width zero-padded byte buffer. Truncates if
/// longer than `length` — UI validates length first, so truncation is a
/// backstop, not the happy path.
Uint8List packFixed(String s, int length) {
  final bytes = utf8.encode(s);
  final out = Uint8List(length);
  final n = bytes.length > length ? length : bytes.length;
  out.setRange(0, n, bytes);
  return out;
}
