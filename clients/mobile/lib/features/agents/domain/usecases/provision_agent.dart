import '../../../../core/onchain/tx_preflight.dart';
import '../../../agent_keys/data/datasources/agent_key_store.dart';
import '../../../agent_keys/data/datasources/agent_seed_derivation.dart';
import '../../../fleet/data/repositories/fleet_repository.dart';
import '../../../onboarding/data/onchain/agent_provisioning_service.dart';
import '../../../wallet/data/datasources/mwa_datasource.dart';

// Re-export so callers don't have to reach into core for the exception
// type they need to catch.
export '../../../../core/onchain/tx_preflight.dart'
    show OnchainSimulationException;

/// End-to-end agent provisioning: derive seed → build tx → sign+send via
/// MWA → persist seed. Both Onboarding (first-run wizard) and the Fleet
/// "Add agent" sheet call this. Don't inline the steps — adding a new
/// caller is the bug magnet that orchestration helpers exist to prevent.
class ProvisionAgentUseCase {
  ProvisionAgentUseCase(
    this._fleet,
    this._derivation,
    this._provisioning,
    this._mwa,
    this._keys,
    this._preflight,
  );

  final FleetRepository _fleet;
  final AgentSeedDerivation _derivation;
  final AgentProvisioningService _provisioning;
  final MwaDataSource _mwa;
  final AgentKeyStore _keys;
  final TxPreflight _preflight;

  /// Returns the new agent's base58 pubkey on success. Throws on any
  /// failure — callers translate exceptions to UI state.
  Future<String> call({
    required String ownerPubkeyBase58,
    required String walletAuthToken,
    required String handle,
    required int depositUsdc,
    required double perTxLimitUsdc,
    required double hourlyLimitUsdc,
    required bool allowPostPay,
  }) async {
    final nextIndex = await _nextAgentIndex(ownerPubkeyBase58);
    final seedBytes = await _derivation.seedForIndex(
      ownerPubkey: ownerPubkeyBase58,
      walletAuthToken: walletAuthToken,
      index: nextIndex,
    );
    final plan = await _provisioning.build(
      ownerPubkeyBase58: ownerPubkeyBase58,
      agentHandle: handle,
      depositUsdc: depositUsdc,
      perTxLimitUsdc: perTxLimitUsdc,
      hourlyLimitUsdc: hourlyLimitUsdc,
      lifetimeLimitUsdc: 0.0,
      allowPostPay: allowPostPay,
      agentSeedBytes: seedBytes,
    );
    await _preflight.check(plan.transactionBytes);
    await _mwa.signAndSendTransaction(
      authToken: walletAuthToken,
      transactionBytes: plan.transactionBytes,
    );
    // Best-effort: the agent is on chain even if local persistence fails.
    // A failure here only breaks the recovery path, not the agent itself.
    try {
      await _keys.save(
        agentPubkey: plan.agentPubkey,
        seedBytes: plan.agentSeedBytes,
      );
    } catch (_) {}
    return plan.agentPubkey;
  }

  Future<int> _nextAgentIndex(String ownerPubkey) async {
    try {
      final agents = await _fleet.listAgents(ownerPubkey: ownerPubkey);
      return agents.length;
    } catch (_) {
      // Backend unreachable → fall back to 0. A collision against an
      // existing index will be rejected by the on-chain InitializeAgent
      // and the caller can retry. Better than blocking on a backend blip.
      return 0;
    }
  }
}
