import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../config/env.dart';

/// Subscribes to a single Agent Fuel WebSocket channel and pushes a callback
/// every time the backend emits an event for it.
///
/// Mirrors Solflare's BalanceWsService design:
///   - Single subscription at a time. Caller switches targets via [watch].
///   - Exponential reconnect backoff (1s → 2s → 4s → 8s → 16s → 30s cap).
///   - Lifecycle-aware: drops the socket on background, reopens on resume.
///   - Silent failures — this is a *push hint* layered over HTTP refresh,
///     not an authoritative data source.
///
/// The backend pushes opaque JSON frames; consumers don't decode them — they
/// re-fetch via HTTP on every notification. Decoding here would couple the
/// service to event schemas that change as the protocol evolves.
class AgentFuelWsService with WidgetsBindingObserver {
  AgentFuelWsService({required this.onChange}) {
    WidgetsBinding.instance.addObserver(this);
  }

  final void Function() onChange;

  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _sub;
  Timer? _pingTimer;
  Timer? _reconnectTimer;

  String? _currentPath;
  int _reconnectAttempts = 0;
  bool _stopped = false;

  /// Begin watching [path] (e.g. `/ws/agents/<pubkey>`). No-op if already
  /// watching the same path; switches target if different.
  Future<void> watch(String path) async {
    if (_currentPath == path && _channel != null) return;
    _stopped = false;
    _currentPath = path;
    await _disconnect();
    _connect();
  }

  /// Stop watching and close the socket. After this the service won't
  /// auto-reconnect on lifecycle events until [watch] is called again.
  Future<void> stop() async {
    _stopped = true;
    _currentPath = null;
    await _disconnect();
  }

  /// Full teardown, including the lifecycle observer. Call on bloc.close.
  Future<void> dispose() async {
    WidgetsBinding.instance.removeObserver(this);
    await stop();
  }

  /// Force a reconnect (e.g. network switch, app resumed from background).
  Future<void> reconnect() async {
    if (_currentPath == null) return;
    await _disconnect();
    _connect();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.resumed:
        if (_currentPath != null && _channel == null) {
          _stopped = false;
          _connect();
        }
        break;
      case AppLifecycleState.paused:
      case AppLifecycleState.detached:
        _disconnect();
        break;
      case AppLifecycleState.inactive:
      case AppLifecycleState.hidden:
        break;
    }
  }

  void _connect() {
    if (_stopped || _currentPath == null) return;
    final url = '${AppEnv.wsBase}$_currentPath';
    try {
      final channel = WebSocketChannel.connect(Uri.parse(url));
      _channel = channel;

      channel.ready.then((_) {
        if (_stopped) return;
        _reconnectAttempts = 0;
      }).catchError((Object _) {
        _scheduleReconnect();
      });

      _sub = channel.stream.listen(
        (_) {
          // Every frame is a push hint — refetch via HTTP.
          if (!_stopped) onChange();
        },
        onError: (Object _) => _scheduleReconnect(),
        onDone: _scheduleReconnect,
        cancelOnError: true,
      );

      // Backend closes idle sockets after 90s — ping every 30s.
      _pingTimer?.cancel();
      _pingTimer = Timer.periodic(const Duration(seconds: 30), (_) {
        try {
          _channel?.sink.add('ping');
        } catch (_) {
          _scheduleReconnect();
        }
      });
    } catch (_) {
      _scheduleReconnect();
    }
  }

  Future<void> _disconnect() async {
    _pingTimer?.cancel();
    _pingTimer = null;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    await _sub?.cancel();
    _sub = null;
    try {
      await _channel?.sink.close();
    } catch (_) {}
    _channel = null;
  }

  void _scheduleReconnect() {
    if (_stopped || _currentPath == null) return;
    _reconnectTimer?.cancel();
    const backoff = [1, 2, 4, 8, 16, 30];
    final delay = backoff[
        _reconnectAttempts < backoff.length ? _reconnectAttempts : backoff.length - 1];
    _reconnectAttempts++;
    _reconnectTimer = Timer(Duration(seconds: delay), () async {
      await _disconnect();
      _connect();
    });
  }
}
