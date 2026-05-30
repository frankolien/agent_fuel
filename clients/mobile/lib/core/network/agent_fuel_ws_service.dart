import 'dart:async';
import 'dart:developer' as developer;

import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/widgets.dart';
import 'package:web_socket_channel/io.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../config/env.dart';

void _log(String msg) {
  if (!kDebugMode) return;
  developer.log(msg, name: 'af.ws');
}

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
  Map<String, dynamic>? _currentHeaders;
  int _reconnectAttempts = 0;
  bool _stopped = false;

  /// Subscribes to [path], optionally attaching [headers] to the WS upgrade
  /// (e.g. `{'Authorization': 'Bearer <jwt>'}` for the alerts channel).
  /// Headers are remembered across reconnects.
  Future<void> watch(String path, {Map<String, dynamic>? headers}) async {
    if (_currentPath == path &&
        _currentHeaders == headers &&
        _channel != null) {
      _log('watch noop (already on $path)');
      return;
    }
    _log('watch path=$path authed=${headers != null}');
    _stopped = false;
    _currentPath = path;
    _currentHeaders = headers;
    await _disconnect();
    _connect();
  }

  Future<void> stop() async {
    _log('stop path=$_currentPath');
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
          _log('lifecycle resumed → reconnect $_currentPath');
          _stopped = false;
          _connect();
        }
        break;
      case AppLifecycleState.paused:
      case AppLifecycleState.detached:
        _log('lifecycle $state → disconnect $_currentPath');
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
    _log('connecting → $url');
    try {
      // IOWebSocketChannel allows custom headers on the upgrade (needed for
      // Bearer-authed channels). Browser WS APIs can't set headers, but
      // mobile is Flutter/Android-only so the dart:io socket is fine.
      final channel = _currentHeaders == null
          ? WebSocketChannel.connect(Uri.parse(url))
          : IOWebSocketChannel.connect(
              Uri.parse(url),
              headers: _currentHeaders,
            );
      _channel = channel;

      channel.ready.then((_) {
        if (_stopped) return;
        _log('ready $_currentPath');
        _reconnectAttempts = 0;
      }).catchError((Object e) {
        _log('ready FAILED $_currentPath: $e');
        _scheduleReconnect();
      });

      _sub = channel.stream.listen(
        (payload) {
          if (_stopped) return;
          final preview = payload is String
              ? (payload.length > 80 ? '${payload.substring(0, 80)}…' : payload)
              : '<${payload.runtimeType}>';
          _log('frame $_currentPath: $preview');
          if (onMessage != null && payload is String) {
            onMessage!(payload);
          }
          onChange();
        },
        onError: (Object e) {
          _log('stream error $_currentPath: $e');
          _scheduleReconnect();
        },
        onDone: () {
          _log('stream done $_currentPath (close=${_channel?.closeCode})');
          _scheduleReconnect();
        },
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
    } catch (e) {
      _log('connect threw $_currentPath: $e');
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
    _log('schedule reconnect $_currentPath in ${delay}s (attempt $_reconnectAttempts)');
    _reconnectTimer = Timer(Duration(seconds: delay), () async {
      await _disconnect();
      _connect();
    });
  }
}
