import 'dart:convert';
import 'dart:typed_data';

import 'package:solana/encoder.dart';
import 'package:solana/solana.dart';

import '../../../../core/config/env.dart';

const _initializeAgentDiscriminator = <int>[212, 81, 156, 211, 212, 110, 21, 28];
const _createVaultDiscriminator = <int>[29, 237, 247, 208, 193, 82, 54, 135];
const _depositDiscriminator = <int>[242, 35, 198, 137, 82, 225, 242, 182];
const _withdrawDiscriminator = <int>[183, 18, 70, 156, 148, 109, 161, 34];
const _freezeVaultDiscriminator = <int>[144, 211, 63, 236, 97, 31, 170, 175];
const _unfreezeVaultDiscriminator = <int>[145, 244, 206, 234, 251, 250, 116, 183];

const _agentSeed = <int>[97, 103, 101, 110, 116]; // "agent"
const _vaultSeed = <int>[118, 97, 117, 108, 116]; // "vault"
const _policySeed = <int>[112, 111, 108, 105, 99, 121]; // "policy"

class OnchainAccounts {
  OnchainAccounts({
    required this.owner,
    required this.agent,
    required this.usdcMint,
    required this.agentProfile,
    required this.vault,
    required this.policy,
    required this.vaultAta,
    required this.ownerAta,
  });

  final Ed25519HDPublicKey owner;
  final Ed25519HDPublicKey agent;
  final Ed25519HDPublicKey usdcMint;
  final Ed25519HDPublicKey agentProfile;
  final Ed25519HDPublicKey vault;
  final Ed25519HDPublicKey policy;
  final Ed25519HDPublicKey vaultAta;
  final Ed25519HDPublicKey ownerAta;
}

Future<OnchainAccounts> deriveOnchainAccounts({
  required Ed25519HDPublicKey owner,
  required Ed25519HDPublicKey agent,
}) async {
  final usdcMint = Ed25519HDPublicKey.fromBase58(AppEnv.usdcMint);
  final reputationProgram =
      Ed25519HDPublicKey.fromBase58(AppEnv.reputationProgramId);
  final creditVaultProgram =
      Ed25519HDPublicKey.fromBase58(AppEnv.creditVaultProgramId);

  final agentProfile = await Ed25519HDPublicKey.findProgramAddress(
    seeds: [_agentSeed, agent.bytes],
    programId: reputationProgram,
  );
  final vault = await Ed25519HDPublicKey.findProgramAddress(
    seeds: [_vaultSeed, owner.bytes, agent.bytes],
    programId: creditVaultProgram,
  );
  final policy = await Ed25519HDPublicKey.findProgramAddress(
    seeds: [_policySeed, vault.bytes],
    programId: creditVaultProgram,
  );
  final vaultAta =
      await findAssociatedTokenAddress(owner: vault, mint: usdcMint);
  final ownerAta =
      await findAssociatedTokenAddress(owner: owner, mint: usdcMint);

  return OnchainAccounts(
    owner: owner,
    agent: agent,
    usdcMint: usdcMint,
    agentProfile: agentProfile,
    vault: vault,
    policy: policy,
    vaultAta: vaultAta,
    ownerAta: ownerAta,
  );
}

Instruction initializeAgentIx({
  required OnchainAccounts accounts,
  required Uint8List agentUri128,
  required int externalAgentId,
}) {
  assert(agentUri128.length == 128, 'agent_uri must be exactly 128 bytes');
  final data = BytesBuilder()
    ..add(_initializeAgentDiscriminator)
    ..add(agentUri128)
    ..add(_u64Le(externalAgentId));
  return Instruction(
    programId: Ed25519HDPublicKey.fromBase58(AppEnv.reputationProgramId),
    accounts: [
      AccountMeta.writeable(pubKey: accounts.owner, isSigner: true),
      AccountMeta.readonly(pubKey: accounts.agent, isSigner: true),
      AccountMeta.writeable(pubKey: accounts.agentProfile, isSigner: false),
      AccountMeta.readonly(pubKey: SystemProgram.id, isSigner: false),
    ],
    data: ByteArray(data.toBytes()),
  );
}

Instruction createVaultIx({
  required OnchainAccounts accounts,
  required int perTxLimitUsdc,
  required int hourlyLimitUsdc,
  required int lifetimeLimitUsdc,
  required bool allowPostPay,
}) {
  final data = BytesBuilder()
    ..add(_createVaultDiscriminator)
    ..add(_u64Le(perTxLimitUsdc))
    ..add(_u64Le(hourlyLimitUsdc))
    ..add(_u64Le(lifetimeLimitUsdc))
    ..addByte(allowPostPay ? 1 : 0);
  return Instruction(
    programId: Ed25519HDPublicKey.fromBase58(AppEnv.creditVaultProgramId),
    accounts: [
      AccountMeta.writeable(pubKey: accounts.owner, isSigner: true),
      AccountMeta.readonly(pubKey: accounts.agent, isSigner: false),
      AccountMeta.readonly(pubKey: accounts.usdcMint, isSigner: false),
      AccountMeta.writeable(pubKey: accounts.vault, isSigner: false),
      AccountMeta.writeable(pubKey: accounts.policy, isSigner: false),
      AccountMeta.writeable(pubKey: accounts.vaultAta, isSigner: false),
      AccountMeta.readonly(pubKey: TokenProgram.id, isSigner: false),
      AccountMeta.readonly(
        pubKey: AssociatedTokenAccountProgram.id,
        isSigner: false,
      ),
      AccountMeta.readonly(pubKey: SystemProgram.id, isSigner: false),
    ],
    data: ByteArray(data.toBytes()),
  );
}

Instruction depositIx({
  required OnchainAccounts accounts,
  required int amountUsdc,
}) {
  final data = BytesBuilder()
    ..add(_depositDiscriminator)
    ..add(_u64Le(amountUsdc));
  return Instruction(
    programId: Ed25519HDPublicKey.fromBase58(AppEnv.creditVaultProgramId),
    accounts: [
      AccountMeta.writeable(pubKey: accounts.owner, isSigner: true),
      AccountMeta.writeable(pubKey: accounts.vault, isSigner: false),
      AccountMeta.writeable(pubKey: accounts.ownerAta, isSigner: false),
      AccountMeta.writeable(pubKey: accounts.vaultAta, isSigner: false),
      AccountMeta.readonly(pubKey: TokenProgram.id, isSigner: false),
    ],
    data: ByteArray(data.toBytes()),
  );
}

Instruction withdrawIx({
  required OnchainAccounts accounts,
  required int amountUsdc,
}) {
  final data = BytesBuilder()
    ..add(_withdrawDiscriminator)
    ..add(_u64Le(amountUsdc));
  return Instruction(
    programId: Ed25519HDPublicKey.fromBase58(AppEnv.creditVaultProgramId),
    accounts: [
      AccountMeta.writeable(pubKey: accounts.owner, isSigner: true),
      AccountMeta.writeable(pubKey: accounts.vault, isSigner: false),
      AccountMeta.writeable(pubKey: accounts.vaultAta, isSigner: false),
      AccountMeta.writeable(pubKey: accounts.ownerAta, isSigner: false),
      AccountMeta.readonly(pubKey: TokenProgram.id, isSigner: false),
    ],
    data: ByteArray(data.toBytes()),
  );
}

Instruction freezeVaultIx({required OnchainAccounts accounts}) {
  return Instruction(
    programId: Ed25519HDPublicKey.fromBase58(AppEnv.creditVaultProgramId),
    accounts: [
      AccountMeta.readonly(pubKey: accounts.owner, isSigner: true),
      AccountMeta.writeable(pubKey: accounts.vault, isSigner: false),
    ],
    data: ByteArray(_freezeVaultDiscriminator),
  );
}

Instruction unfreezeVaultIx({required OnchainAccounts accounts}) {
  return Instruction(
    programId: Ed25519HDPublicKey.fromBase58(AppEnv.creditVaultProgramId),
    accounts: [
      AccountMeta.readonly(pubKey: accounts.owner, isSigner: true),
      AccountMeta.writeable(pubKey: accounts.vault, isSigner: false),
    ],
    data: ByteArray(_unfreezeVaultDiscriminator),
  );
}

// sha256("global:approve_spend")[..8]
const _approveSpendDiscriminator = <int>[248, 201, 151, 15, 28, 162, 112, 90];
// sha256("global:cancel_spend")[..8]
const _cancelSpendDiscriminator = <int>[122, 254, 101, 132, 241, 232, 205, 179];

Instruction approveSpendIx({
  required OnchainAccounts accounts,
  required Ed25519HDPublicKey pendingSpend,
  required Ed25519HDPublicKey serviceTokenAccount,
}) {
  return Instruction(
    programId: Ed25519HDPublicKey.fromBase58(AppEnv.creditVaultProgramId),
    accounts: [
      AccountMeta.writeable(pubKey: accounts.owner, isSigner: true),
      AccountMeta.writeable(pubKey: accounts.vault, isSigner: false),
      AccountMeta.writeable(pubKey: accounts.policy, isSigner: false),
      AccountMeta.writeable(pubKey: pendingSpend, isSigner: false),
      AccountMeta.writeable(pubKey: accounts.vaultAta, isSigner: false),
      AccountMeta.writeable(pubKey: serviceTokenAccount, isSigner: false),
      AccountMeta.readonly(pubKey: TokenProgram.id, isSigner: false),
    ],
    data: ByteArray(_approveSpendDiscriminator),
  );
}

Instruction cancelSpendIx({
  required OnchainAccounts accounts,
  required Ed25519HDPublicKey pendingSpend,
}) {
  return Instruction(
    programId: Ed25519HDPublicKey.fromBase58(AppEnv.creditVaultProgramId),
    accounts: [
      AccountMeta.writeable(pubKey: accounts.owner, isSigner: true),
      AccountMeta.readonly(pubKey: accounts.vault, isSigner: false),
      AccountMeta.writeable(pubKey: pendingSpend, isSigner: false),
    ],
    data: ByteArray(_cancelSpendDiscriminator),
  );
}

Uint8List encodeAgentUri(String uri) {
  final bytes = Uint8List(128);
  final encoded = utf8.encode(uri);
  final n = encoded.length > 128 ? 128 : encoded.length;
  bytes.setRange(0, n, encoded);
  return bytes;
}

List<int> _u64Le(int value) {
  final b = ByteData(8)..setUint64(0, value, Endian.little);
  return b.buffer.asUint8List();
}
