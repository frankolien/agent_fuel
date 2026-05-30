import '../../../wallet/data/repositories/wallet_repository.dart';
import 'agent_key_store.dart';
import 'agent_seed_derivation.dart';

/// Walks the wallet's on-chain agent list, deriving seeds for indices the
/// device doesn't already cache. Recovered seeds land in [AgentKeyStore]
/// so the orphan banner stops showing for derivable agents.
///
/// Constraints:
///   * Silent. Never prompts the wallet — we only sweep when the master
///     signature is already cached. (The user can trigger an explicit
///     prompt from the orphan banner if they want active recovery.)
///   * Tolerant. Any error during a single index is swallowed; we keep
///     trying the rest. The worst case is "no progress", not "fleet
///     broken".
class AgentSeedRecoverySweeper {
  AgentSeedRecoverySweeper(this._wallet, this._keys, this._derivation);

  final WalletRepository _wallet;
  final AgentKeyStore _keys;
  final AgentSeedDerivation _derivation;

  /// `onChainAgentPubkeys` is the full set of agent pubkeys this wallet
  /// owns according to the backend. Returns the count of newly persisted
  /// seeds (useful for tests / debug logging).
  Future<int> sweep(List<String> onChainAgentPubkeys) async {
    if (onChainAgentPubkeys.isEmpty) return 0;

    final orphaned = <String>[];
    for (final pk in onChainAgentPubkeys) {
      if (!await _keys.has(pk)) orphaned.add(pk);
    }
    if (orphaned.isEmpty) return 0;

    final wallet = await _wallet.cachedConnection();
    if (wallet == null) return 0;
    if (!await _derivation.hasMasterSig(wallet.pubkeyBase58)) {
      // Silent mode: don't surprise the user with a wallet prompt during a
      // passive Fleet load. The orphan banner exposes a manual trigger.
      return 0;
    }

    final derived = await _derivation.deriveBatch(
      ownerPubkey: wallet.pubkeyBase58,
      walletAuthToken: wallet.authToken,
      count: onChainAgentPubkeys.length,
    );
    final byPubkey = {for (final d in derived) d.pubkey: d.seed};

    var recovered = 0;
    for (final pk in orphaned) {
      final seed = byPubkey[pk];
      if (seed == null) continue;
      try {
        await _keys.save(agentPubkey: pk, seedBytes: seed);
        recovered++;
      } catch (_) {
        // Storage write failed — try the rest.
      }
    }
    return recovered;
  }
}
