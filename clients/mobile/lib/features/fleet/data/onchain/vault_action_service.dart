import 'dart:typed_data';

import 'package:cryptography/cryptography.dart' show Signature, SimplePublicKey, KeyPairType;
import 'package:solana/encoder.dart';
import 'package:solana/solana.dart';

import '../../../../core/config/env.dart';
import '../../../onboarding/data/onchain/agent_instructions.dart';
import '../../../wallet/data/datasources/mwa_datasource.dart';

class VaultActionService {
  VaultActionService(this._mwa, {RpcClient? rpc})
      : _rpc = rpc ?? RpcClient(AppEnv.rpcUrl);

  final MwaDataSource _mwa;
  final RpcClient _rpc;

  Future<String> fund({
    required String ownerPubkeyBase58,
    required String agentPubkeyBase58,
    required String walletAuthToken,
    required int amountUsdc,
  }) async {
    final accounts = await _deriveAccounts(ownerPubkeyBase58, agentPubkeyBase58);
    final amountMicro = amountUsdc * 1000000;
    return _submit(
      ownerPubkeyBase58: ownerPubkeyBase58,
      walletAuthToken: walletAuthToken,
      instruction:
          depositIx(accounts: accounts, amountUsdc: amountMicro),
    );
  }

  Future<String> withdraw({
    required String ownerPubkeyBase58,
    required String agentPubkeyBase58,
    required String walletAuthToken,
    required int amountMicroUsdc,
  }) async {
    final accounts = await _deriveAccounts(ownerPubkeyBase58, agentPubkeyBase58);
    return _submit(
      ownerPubkeyBase58: ownerPubkeyBase58,
      walletAuthToken: walletAuthToken,
      instruction:
          withdrawIx(accounts: accounts, amountUsdc: amountMicroUsdc),
    );
  }

  /// Reads the vault's USDC ATA balance directly from chain. Returns the
  /// raw u64 micro-USDC. Throws if the ATA doesn't exist (vault never
  /// funded) — callers should treat that as a zero balance.
  Future<int> fetchVaultBalanceMicro({
    required String ownerPubkeyBase58,
    required String agentPubkeyBase58,
  }) async {
    final accounts = await _deriveAccounts(ownerPubkeyBase58, agentPubkeyBase58);
    try {
      final res = await _rpc.getTokenAccountBalance(accounts.vaultAta.toBase58());
      return int.parse(res.value.amount);
    } catch (_) {
      return 0;
    }
  }

  Future<String> freeze({
    required String ownerPubkeyBase58,
    required String agentPubkeyBase58,
    required String walletAuthToken,
  }) async {
    final accounts = await _deriveAccounts(ownerPubkeyBase58, agentPubkeyBase58);
    return _submit(
      ownerPubkeyBase58: ownerPubkeyBase58,
      walletAuthToken: walletAuthToken,
      instruction: freezeVaultIx(accounts: accounts),
    );
  }

  Future<String> unfreeze({
    required String ownerPubkeyBase58,
    required String agentPubkeyBase58,
    required String walletAuthToken,
  }) async {
    final accounts = await _deriveAccounts(ownerPubkeyBase58, agentPubkeyBase58);
    return _submit(
      ownerPubkeyBase58: ownerPubkeyBase58,
      walletAuthToken: walletAuthToken,
      instruction: unfreezeVaultIx(accounts: accounts),
    );
  }

  /// Owner-signed approval of a queued over-limit spend. Derives the
  /// service's ATA from `serviceOwnerBase58` (the service pubkey we record
  /// in PendingSpend.service is the SPL token account *owner*, not the ATA
  /// itself — same convention as the on-chain `Spent` event).
  Future<String> approveSpend({
    required String ownerPubkeyBase58,
    required String agentPubkeyBase58,
    required String walletAuthToken,
    required String pendingSpendPubkeyBase58,
    required String serviceOwnerBase58,
  }) async {
    final accounts = await _deriveAccounts(ownerPubkeyBase58, agentPubkeyBase58);
    final serviceAta = await findAssociatedTokenAddress(
      owner: Ed25519HDPublicKey.fromBase58(serviceOwnerBase58),
      mint: accounts.usdcMint,
    );
    return _submit(
      ownerPubkeyBase58: ownerPubkeyBase58,
      walletAuthToken: walletAuthToken,
      instruction: approveSpendIx(
        accounts: accounts,
        pendingSpend: Ed25519HDPublicKey.fromBase58(pendingSpendPubkeyBase58),
        serviceTokenAccount: serviceAta,
      ),
    );
  }

  Future<String> cancelSpend({
    required String ownerPubkeyBase58,
    required String agentPubkeyBase58,
    required String walletAuthToken,
    required String pendingSpendPubkeyBase58,
  }) async {
    final accounts = await _deriveAccounts(ownerPubkeyBase58, agentPubkeyBase58);
    return _submit(
      ownerPubkeyBase58: ownerPubkeyBase58,
      walletAuthToken: walletAuthToken,
      instruction: cancelSpendIx(
        accounts: accounts,
        pendingSpend: Ed25519HDPublicKey.fromBase58(pendingSpendPubkeyBase58),
      ),
    );
  }

  Future<OnchainAccounts> _deriveAccounts(
    String ownerBase58,
    String agentBase58,
  ) async {
    return deriveOnchainAccounts(
      owner: Ed25519HDPublicKey.fromBase58(ownerBase58),
      agent: Ed25519HDPublicKey.fromBase58(agentBase58),
    );
  }

  Future<String> _submit({
    required String ownerPubkeyBase58,
    required String walletAuthToken,
    required Instruction instruction,
  }) async {
    final owner = Ed25519HDPublicKey.fromBase58(ownerPubkeyBase58);
    final blockhash = await _rpc.getLatestBlockhash();
    final compiled = Message(instructions: [instruction]).compile(
      recentBlockhash: blockhash.value.blockhash,
      feePayer: owner,
    );
    final required = compiled.header.numRequiredSignatures;
    final placeholder = Signature(
      List<int>.filled(64, 0),
      publicKey: SimplePublicKey(owner.bytes, type: KeyPairType.ed25519),
    );
    final signedTx = SignedTx(
      signatures: List<Signature>.filled(required, placeholder),
      compiledMessage: compiled,
    );
    final bytes = Uint8List.fromList(signedTx.toByteArray().toList());
    return _mwa.signAndSendTransaction(
      authToken: walletAuthToken,
      transactionBytes: bytes,
    );
  }
}
