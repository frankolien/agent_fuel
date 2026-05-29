import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart' show Signature, SimplePublicKey, KeyPairType;
import 'package:solana/encoder.dart';
import 'package:solana/solana.dart';

import '../../../../core/config/env.dart';
import 'agent_instructions.dart';

class AgentProvisioningPlan {
  AgentProvisioningPlan({
    required this.transactionBytes,
    required this.agentPubkey,
  });

  final Uint8List transactionBytes;
  final String agentPubkey;
}

class AgentProvisioningService {
  AgentProvisioningService({RpcClient? rpc})
      : _rpc = rpc ?? RpcClient(AppEnv.rpcUrl);

  final RpcClient _rpc;

  Future<AgentProvisioningPlan> build({
    required String ownerPubkeyBase58,
    required String agentHandle,
    required int depositUsdc,
    required double perTxLimitUsdc,
    required double hourlyLimitUsdc,
    required double lifetimeLimitUsdc,
    required bool allowPostPay,
  }) async {
    final owner = Ed25519HDPublicKey.fromBase58(ownerPubkeyBase58);
    final agentKeypair = await Ed25519HDKeyPair.random();
    final agentPubkey = agentKeypair.publicKey;
    final accounts =
        await deriveOnchainAccounts(owner: owner, agent: agentPubkey);

    final depositMicro = depositUsdc * 1000000;
    final perTxMicro = (perTxLimitUsdc * 1000000).round();
    final hourlyMicro = (hourlyLimitUsdc * 1000000).round();
    final lifetimeMicro = (lifetimeLimitUsdc * 1000000).round();

    final agentUri = encodeAgentUri('agentfuel://agent/$agentHandle');
    final externalAgentId = _randomU63();

    final instructions = <Instruction>[
      initializeAgentIx(
        accounts: accounts,
        agentUri128: agentUri,
        externalAgentId: externalAgentId,
      ),
      createVaultIx(
        accounts: accounts,
        perTxLimitUsdc: perTxMicro,
        hourlyLimitUsdc: hourlyMicro,
        lifetimeLimitUsdc: lifetimeMicro,
        allowPostPay: allowPostPay,
      ),
      if (depositMicro > 0)
        depositIx(accounts: accounts, amountUsdc: depositMicro),
    ];

    final blockhash = await _rpc.getLatestBlockhash();
    final message = Message(instructions: instructions);
    final compiled = message.compile(
      recentBlockhash: blockhash.value.blockhash,
      feePayer: owner,
    );

    final required = compiled.header.numRequiredSignatures;
    final agentIndex = compiled.accountKeys.indexOf(agentPubkey);
    if (agentIndex < 0 || agentIndex >= required) {
      throw StateError(
        'Agent key not found among required signers (index=$agentIndex, '
        'required=$required)',
      );
    }

    final agentSig = await agentKeypair.sign(compiled.toByteArray());
    final placeholder = Signature(
      List<int>.filled(64, 0),
      publicKey: SimplePublicKey(owner.bytes, type: KeyPairType.ed25519),
    );

    final signatures = List<Signature>.filled(required, placeholder);
    signatures[agentIndex] = agentSig;

    final signedTx = SignedTx(
      signatures: signatures,
      compiledMessage: compiled,
    );

    return AgentProvisioningPlan(
      transactionBytes: Uint8List.fromList(signedTx.toByteArray().toList()),
      agentPubkey: agentPubkey.toBase58(),
    );
  }

  int _randomU63() {
    final r = Random.secure();
    return (r.nextInt(1 << 31) << 31) | r.nextInt(1 << 31);
  }
}
