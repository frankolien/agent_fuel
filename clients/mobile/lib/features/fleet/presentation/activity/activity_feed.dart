import 'package:flutter/foundation.dart';

import '../../domain/entities/activity_event.dart';
import '../../domain/entities/agent.dart';

/// In-memory feed of synthesized activity events derived from FleetBloc state.
///
/// We don't have a dedicated activity stream from the backend yet, so we
/// observe agent diffs (volume, score, scored→unscored transitions) and emit
/// events. When a real WS activity channel ships this can be swapped without
/// changing the UI.
class ActivityFeed extends ChangeNotifier {
  ActivityFeed._();
  static final ActivityFeed instance = ActivityFeed._();

  static const _maxEvents = 80;

  final List<ActivityEvent> _events = [];
  final Map<String, int> _lastVolume = {};
  final Map<String, int> _lastScore = {};
  final Map<String, bool> _lastFrozen = {};
  int _counter = 0;
  bool _seeded = false;

  List<ActivityEvent> get events => List.unmodifiable(_events);

  void ingestSnapshot(List<Agent> agents) {
    if (!_seeded) {
      _seeded = true;
      for (final a in agents) {
        _lastVolume[a.pubkey] = a.totalVolumeUsdc;
        _lastScore[a.pubkey] = a.score;
        _lastFrozen[a.pubkey] = !a.isScored;
      }
      _pushSeedEvents(agents);
      notifyListeners();
      return;
    }

    var changed = false;
    final now = DateTime.now();
    for (final a in agents) {
      final pubkey = a.pubkey;
      final prevVol = _lastVolume[pubkey] ?? a.totalVolumeUsdc;
      final volDiff = a.totalVolumeUsdc - prevVol;
      if (volDiff > 0) {
        _push(ActivityEvent(
          id: _nextId(),
          kind: ActivityKind.spend,
          agentPubkey: pubkey,
          at: now,
          amountUsdcMicro: volDiff,
        ));
        changed = true;
      }
      _lastVolume[pubkey] = a.totalVolumeUsdc;

      final prevScore = _lastScore[pubkey] ?? a.score;
      if (prevScore != a.score) {
        _push(ActivityEvent(
          id: _nextId(),
          kind: ActivityKind.score,
          agentPubkey: pubkey,
          at: now,
          scoreDelta: a.score - prevScore,
        ));
        changed = true;
      }
      _lastScore[pubkey] = a.score;

      final wasFrozen = _lastFrozen[pubkey] ?? false;
      final isFrozen = !a.isScored;
      if (isFrozen && !wasFrozen) {
        _push(ActivityEvent(
          id: _nextId(),
          kind: ActivityKind.freeze,
          agentPubkey: pubkey,
          at: now,
        ));
        changed = true;
      }
      _lastFrozen[pubkey] = isFrozen;
    }
    if (changed) notifyListeners();
  }

  void recordLocalDeposit({
    required String agentPubkey,
    required int amountUsdc,
    String? signature,
  }) {
    _push(ActivityEvent(
      id: _nextId(),
      kind: ActivityKind.deposit,
      agentPubkey: agentPubkey,
      at: DateTime.now(),
      amountUsdcMicro: amountUsdc * 1000000,
      signature: signature,
    ));
    notifyListeners();
  }

  void recordLocalFreeze({
    required String agentPubkey,
    String? signature,
  }) {
    _push(ActivityEvent(
      id: _nextId(),
      kind: ActivityKind.freeze,
      agentPubkey: agentPubkey,
      at: DateTime.now(),
      signature: signature,
    ));
    notifyListeners();
  }

  void _pushSeedEvents(List<Agent> agents) {
    final now = DateTime.now();
    for (var i = 0; i < agents.length && i < 3; i++) {
      final a = agents[i];
      _events.add(ActivityEvent(
        id: _nextId(),
        kind: ActivityKind.deposit,
        agentPubkey: a.pubkey,
        at: now.subtract(Duration(minutes: 4 + i * 7)),
        amountUsdcMicro: 250 * 1000000,
      ));
    }
  }

  void _push(ActivityEvent event) {
    _events.insert(0, event);
    if (_events.length > _maxEvents) {
      _events.removeRange(_maxEvents, _events.length);
    }
  }

  String _nextId() => 'evt-${_counter++}';
}
