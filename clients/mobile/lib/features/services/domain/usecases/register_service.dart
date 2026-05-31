import '../../../../core/onchain/tx_preflight.dart';
import '../../../wallet/data/datasources/mwa_datasource.dart';
import '../../data/datasources/service_key_store.dart';
import '../../data/datasources/service_seed_derivation.dart';
import '../../data/onchain/service_provisioning_service.dart';
import '../entities/service_category.dart';

export '../../../../core/onchain/tx_preflight.dart'
    show OnchainSimulationException;

/// End-to-end service registration: derive seed → build tx → MWA sign →
/// persist seed. Mirrors `ProvisionAgentUseCase`.
class RegisterServiceUseCase {
  RegisterServiceUseCase(
    this._derivation,
    this._provisioning,
    this._mwa,
    this._keys,
    this._preflight,
  );

  final ServiceSeedDerivation _derivation;
  final ServiceProvisioningService _provisioning;
  final MwaDataSource _mwa;
  final ServiceKeyStore _keys;
  final TxPreflight _preflight;

  /// Returns the new service's base58 pubkey on success. Throws on any
  /// failure — callers translate exceptions to UI state.
  Future<String> call({
    required String ownerPubkeyBase58,
    required String walletAuthToken,
    required String name,
    required ServiceCategory category,
    required String serviceUri,
  }) async {
    final nextIndex = await _nextServiceIndex();
    final seedBytes = await _derivation.seedForIndex(
      ownerPubkey: ownerPubkeyBase58,
      walletAuthToken: walletAuthToken,
      index: nextIndex,
    );
    final plan = await _provisioning.build(
      sponsorPubkeyBase58: ownerPubkeyBase58,
      name: name,
      category: category,
      serviceUri: serviceUri,
      serviceSeedBytes: seedBytes,
    );
    await _preflight.check(plan.transactionBytes);
    await _mwa.signAndSendTransaction(
      authToken: walletAuthToken,
      transactionBytes: plan.transactionBytes,
    );
    // Best-effort persistence. The service is on chain even if local save
    // fails — losing the seed only blocks future record_payment calls,
    // not the registration itself.
    try {
      await _keys.save(
        servicePubkey: plan.servicePubkey,
        seedBytes: plan.serviceSeedBytes,
      );
    } catch (_) {}
    return plan.servicePubkey;
  }

  /// Local index = how many services this device has already produced. On
  /// a fresh install (no local seeds) we start at 0. Collisions against
  /// an existing on-chain registry will be rejected by Anchor and the
  /// caller retries. Backend-side global index would require auth +
  /// owner-scoping; deferring until services list per-owner.
  Future<int> _nextServiceIndex() async {
    try {
      final mine = await _keys.listServices();
      return mine.length;
    } catch (_) {
      return 0;
    }
  }
}
