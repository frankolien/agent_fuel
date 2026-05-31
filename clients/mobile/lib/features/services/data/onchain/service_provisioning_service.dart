import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart'
    show KeyPairType, Signature, SimplePublicKey;
import 'package:solana/encoder.dart';
import 'package:solana/solana.dart';

import '../../../../core/config/env.dart';
import '../../domain/entities/service_category.dart';
import 'service_instructions.dart';

const int kServiceEd25519SeedBytes = 32;

class ServiceProvisioningPlan {
  ServiceProvisioningPlan({
    required this.transactionBytes,
    required this.servicePubkey,
    required this.serviceSeedBytes,
  });

  final Uint8List transactionBytes;
  final String servicePubkey;
  final Uint8List serviceSeedBytes;
}

/// Builds a partially-signed two-signer `register_service` transaction.
/// The service keypair signs locally (the user generates it); the wallet
/// (sponsor) signs via MWA. Mirrors `AgentProvisioningService`.
class ServiceProvisioningService {
  ServiceProvisioningService({RpcClient? rpc})
      : _rpc = rpc ?? RpcClient(AppEnv.rpcUrl);

  final RpcClient _rpc;

  Future<ServiceProvisioningPlan> build({
    required String sponsorPubkeyBase58,
    required String name,
    required ServiceCategory category,
    required String serviceUri,
    Uint8List? serviceSeedBytes,
  }) async {
    final sponsor = Ed25519HDPublicKey.fromBase58(sponsorPubkeyBase58);
    final seedBytes = serviceSeedBytes ?? _randomSeed();
    assert(
      seedBytes.length == kServiceEd25519SeedBytes,
      'ed25519 seed must be 32 bytes',
    );
    final serviceKeypair =
        await Ed25519HDKeyPair.fromPrivateKeyBytes(privateKey: seedBytes);
    final servicePubkey = serviceKeypair.publicKey;
    final accounts = await deriveServiceAccounts(
      sponsor: sponsor,
      service: servicePubkey,
    );

    final ix = registerServiceIx(
      accounts: accounts,
      name32: packFixed(name, 32),
      categoryOnchain: category.onchainValue,
      uri128: packFixed(serviceUri, 128),
    );

    final blockhash = await _rpc.getLatestBlockhash();
    final compiled = Message(instructions: [ix]).compile(
      recentBlockhash: blockhash.value.blockhash,
      feePayer: sponsor,
    );

    final required = compiled.header.numRequiredSignatures;
    final serviceIndex = compiled.accountKeys.indexOf(servicePubkey);
    if (serviceIndex < 0 || serviceIndex >= required) {
      throw StateError(
        'Service key not found among required signers '
        '(index=$serviceIndex, required=$required)',
      );
    }

    final serviceSig = await serviceKeypair.sign(compiled.toByteArray());
    final placeholder = Signature(
      List<int>.filled(64, 0),
      publicKey: SimplePublicKey(sponsor.bytes, type: KeyPairType.ed25519),
    );
    final signatures = List<Signature>.filled(required, placeholder);
    signatures[serviceIndex] = serviceSig;

    final signedTx = SignedTx(
      signatures: signatures,
      compiledMessage: compiled,
    );

    return ServiceProvisioningPlan(
      transactionBytes: Uint8List.fromList(signedTx.toByteArray().toList()),
      servicePubkey: servicePubkey.toBase58(),
      serviceSeedBytes: seedBytes,
    );
  }

  Uint8List _randomSeed() {
    final r = Random.secure();
    return Uint8List.fromList(
      List<int>.generate(kServiceEd25519SeedBytes, (_) => r.nextInt(256)),
    );
  }
}
