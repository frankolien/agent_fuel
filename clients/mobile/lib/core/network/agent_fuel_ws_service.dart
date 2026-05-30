import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../config/env.dart';

/// Subscribes to a single Agent Fuel WebSocket channel and notifies via
/// [onChange] each time the backend pushes a frame. Frames are opaque — the
/// caller re-fetches via HTTP to read the authoritative state.
///
/// Behavior:
///   - One subscription at a time. [watch] switches targets.
///   - Reconnect backoff: 1, 2, 4, 8, 16, 30 s.
///   - Drops the socket on background, reopens on resume.
class AgentFuelWsService with WidgetsBindingObserver {
  AgentFuelWsService({required this.onChange, this.onMessage}) {
    WidgetsBinding.instance.addObserver(this);
  }

  final void Function() onChange;
  final void Function(String payload)? onMessage;

  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _sub;
  Timer? _pingTimer;
  Timer? _reconnectTimer;

  String? _currentPath;
  int _reconnectAttempts = 0;
  bool _stopped = false;

  Future<void> watch(String path) async {
    if (_currentPath == path && _channel != null) return;
    _stopped = false;
    _currentPath = path;
    await _disconnect();
    _connect();
  }

  Future<void> stop() async {
    _stopped = true;
    _currentPath = null;
    await _disconnect();
  }

  Future<void> dispose() async {
    WidgetsBinding.instance.removeObserver(this);
    await stop();
  }

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
        (payload) {
          if (_stopped) return;
          if (onMessage != null && payload is String) {
            onMessage!(payload);
          }
          onChange();
        },
        onError: (Object _) => _scheduleReconnect(),
        onDone: _scheduleReconnect,
        cancelOnError: true,
      );

      // Backend closes idle sockets after 90 s.
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
