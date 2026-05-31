import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../network/api_endpoint.dart';
import '../network/dio_client.dart';

void _log(String msg) {
  if (!kDebugMode) return;
  developer.log(msg, name: 'af.fcm');
}

/// Backgrounded / killed-app messages with a `notification` payload are
/// rendered by the OS automatically — this handler is only invoked for
/// data-only payloads. Must be a top-level function so it can be hoisted
/// into the dedicated background isolate.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // No-op: every alert we send carries a `notification` block, so the OS
  // owns the tray render. If we add silent data-only pushes later (e.g.
  // for in-app badge refresh), wire the work here.
}

/// Foreground-aware FCM client. Owns Firebase init, the notification
/// channel, the token-registration cycle against the backend, and the
/// stream of tap events the router subscribes to in order to deep-link
/// into the right alert.
class FcmService {
  FcmService(this._dio);

  final DioClient _dio;

  static const _approvalsChannelId = 'approvals';
  static const _approvalsChannelName = 'Approval requests';
  static const _approvalsChannelDescription =
      'Urgent spend approvals waiting on your decision.';

  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();
  final StreamController<FcmAlertTap> _taps =
      StreamController<FcmAlertTap>.broadcast();

  /// Fires whenever the user taps a push that maps to an alert — both the
  /// in-foreground local notification path and the background tray path
  /// emit through here. The router/AlertsBloc subscribes to deep-link.
  Stream<FcmAlertTap> get onAlertTap => _taps.stream;

  bool _initialised = false;
  int? _registeredDeviceId;
  String? _registeredToken;
  StreamSubscription<String>? _tokenRefreshSub;
  StreamSubscription<RemoteMessage>? _foregroundSub;
  StreamSubscription<RemoteMessage>? _openedSub;

  Future<void> init() async {
    if (_initialised) return;
    try {
      await Firebase.initializeApp();
    } catch (e, st) {
      // Most common cause: google-services.json hasn't been dropped in
      // yet. Don't crash the app — push is opt-in and the rest of the app
      // (in-app alerts WS, REST polling) still works without it.
      _log('Firebase.initializeApp failed: $e\n$st');
      return;
    }

    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

    await _localNotifications.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      ),
      onDidReceiveNotificationResponse: _handleLocalTap,
    );
    await _localNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(
      const AndroidNotificationChannel(
        _approvalsChannelId,
        _approvalsChannelName,
        description: _approvalsChannelDescription,
        importance: Importance.high,
      ),
    );

    _foregroundSub = FirebaseMessaging.onMessage.listen(_showForeground);
    _openedSub = FirebaseMessaging.onMessageOpenedApp.listen(_handleRemoteTap);
    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) _handleRemoteTap(initial);

    _initialised = true;
    _log('initialised');
  }

  /// Call once the owner is known (post wallet connect / cached
  /// connection). Idempotent — re-registers the current token under the
  /// new owner. The backend's `(owner, fcm_token)` unique key dedupes.
  Future<void> registerForOwner(String ownerPubkey) async {
    if (!_initialised) return;

    final settings = await FirebaseMessaging.instance.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    if (settings.authorizationStatus == AuthorizationStatus.denied) {
      _log('notification permission denied — skipping device registration');
      return;
    }

    final token = await FirebaseMessaging.instance.getToken();
    if (token == null) {
      _log('FCM token unavailable — getToken returned null');
      return;
    }
    await _registerToken(token);

    await _tokenRefreshSub?.cancel();
    _tokenRefreshSub = FirebaseMessaging.instance.onTokenRefresh.listen((t) {
      _log('token refreshed; re-registering');
      _registerToken(t);
    });
  }

  /// Call on logout / wallet disconnect. Best-effort: deletes the
  /// device_tokens row, cancels the refresh subscription, drops the
  /// cached token. Doesn't throw — caller is probably already tearing
  /// down session state.
  Future<void> unregister() async {
    await _tokenRefreshSub?.cancel();
    _tokenRefreshSub = null;

    final id = _registeredDeviceId;
    if (id != null) {
      try {
        await _dio.dio.delete<void>(ApiEndpoint.device(id));
      } catch (e) {
        _log('device unregister failed: $e');
      }
    }
    _registeredDeviceId = null;
    _registeredToken = null;

    try {
      await FirebaseMessaging.instance.deleteToken();
    } catch (e) {
      _log('deleteToken failed: $e');
    }
  }

  Future<void> _registerToken(String token) async {
    if (_registeredToken == token && _registeredDeviceId != null) return;
    try {
      final resp = await _dio.dio.post<Map<String, dynamic>>(
        ApiEndpoint.devices,
        data: {'fcm_token': token, 'platform': 'android'},
      );
      final id = resp.data?['id'] as int?;
      _registeredDeviceId = id;
      _registeredToken = token;
      _log('device registered id=$id');
    } catch (e) {
      _log('device register failed: $e');
    }
  }

  void _showForeground(RemoteMessage message) {
    final notif = message.notification;
    if (notif == null) return;
    final title = notif.title ?? 'Agent Fuel';
    final body = notif.body ?? '';
    final tap = _parseTap(message.data);
    _log('foreground msg title="$title" tap=$tap');
    _localNotifications.show(
      message.hashCode,
      title,
      body,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          _approvalsChannelId,
          _approvalsChannelName,
          channelDescription: _approvalsChannelDescription,
          importance: Importance.high,
          priority: Priority.high,
        ),
      ),
      payload: tap == null ? null : jsonEncode(tap.toJson()),
    );
  }

  void _handleRemoteTap(RemoteMessage message) {
    final tap = _parseTap(message.data);
    if (tap == null) return;
    _log('remote tap kind=${tap.kind} pending=${tap.pendingSpendPubkey}');
    _taps.add(tap);
  }

  void _handleLocalTap(NotificationResponse response) {
    final raw = response.payload;
    if (raw == null) return;
    try {
      final json = jsonDecode(raw) as Map<String, dynamic>;
      final tap = FcmAlertTap.fromJson(json);
      _log('local tap kind=${tap.kind} pending=${tap.pendingSpendPubkey}');
      _taps.add(tap);
    } catch (e) {
      _log('local tap payload parse failed: $e');
    }
  }

  FcmAlertTap? _parseTap(Map<String, dynamic> data) {
    if (data.isEmpty) return null;
    final kind = data['kind'] as String?;
    final payloadRaw = data['payload'] as String?;
    Map<String, dynamic>? payload;
    if (payloadRaw != null) {
      try {
        payload = jsonDecode(payloadRaw) as Map<String, dynamic>;
      } catch (_) {
        payload = null;
      }
    }
    return FcmAlertTap(
      kind: kind ?? 'unknown',
      pendingSpendPubkey: payload?['pending_spend_pubkey'] as String?,
      pendingSpendId: payload?['pending_spend_id'] as int?,
      agentPubkey: payload?['agent'] as String?,
    );
  }

  Future<void> dispose() async {
    await _foregroundSub?.cancel();
    await _openedSub?.cancel();
    await _tokenRefreshSub?.cancel();
    await _taps.close();
  }
}

class FcmAlertTap {
  const FcmAlertTap({
    required this.kind,
    this.pendingSpendPubkey,
    this.pendingSpendId,
    this.agentPubkey,
  });

  factory FcmAlertTap.fromJson(Map<String, dynamic> json) => FcmAlertTap(
        kind: json['kind'] as String? ?? 'unknown',
        pendingSpendPubkey: json['pending_spend_pubkey'] as String?,
        pendingSpendId: json['pending_spend_id'] as int?,
        agentPubkey: json['agent'] as String?,
      );

  final String kind;
  final String? pendingSpendPubkey;
  final int? pendingSpendId;
  final String? agentPubkey;

  Map<String, dynamic> toJson() => {
        'kind': kind,
        if (pendingSpendPubkey != null) 'pending_spend_pubkey': pendingSpendPubkey,
        if (pendingSpendId != null) 'pending_spend_id': pendingSpendId,
        if (agentPubkey != null) 'agent': agentPubkey,
      };
}
