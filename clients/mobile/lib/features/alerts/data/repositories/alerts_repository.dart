import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/network/agent_fuel_ws_service.dart';
import '../../../../core/network/api_endpoint.dart';
import '../../domain/entities/alert.dart';

class AlertsRepository extends ChangeNotifier {
  AlertsRepository(this._dio);

  final Dio _dio;
  AgentFuelWsService? _ws;

  List<Alert> _alerts = const [];
  bool _loading = false;
  String? _error;
  String? _ownerWatched;

  List<Alert> get alerts => _alerts;
  bool get loading => _loading;
  String? get error => _error;
  int get unreadCount => _alerts.where((a) => !a.isRead).length;

  Future<void> refresh({bool silent = false}) async {
    if (!silent) {
      _loading = true;
      _error = null;
      notifyListeners();
    }
    try {
      final res = await _dio.get<List<dynamic>>(ApiEndpoint.alerts);
      _alerts = (res.data ?? const [])
          .map((e) => Alert.fromJson(e as Map<String, dynamic>))
          .toList(growable: false);
      _error = null;
    } on DioException catch (e) {
      final inner = e.error;
      if (inner is ServerException) {
        _error = inner.message;
      } else if (inner is NetworkException) {
        _error = inner.message;
      } else {
        _error = e.message ?? 'Failed to load alerts';
      }
    } catch (e) {
      _error = e.toString();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  /// Subscribes to `/ws/alerts/{owner}`. Pushed frames are JSON-encoded Alert
  /// payloads — we merge them into the head of the list and notify listeners
  /// without round-tripping HTTP.
  void watch(String ownerPubkey) {
    if (_ownerWatched == ownerPubkey && _ws != null) return;
    _ownerWatched = ownerPubkey;
    _ws?.dispose();
    _ws = AgentFuelWsService(
      onChange: () {},
      onMessage: _ingest,
    );
    _ws!.watch(ApiEndpoint.wsAlerts(ownerPubkey));
  }

  Future<void> stop() async {
    _ownerWatched = null;
    await _ws?.dispose();
    _ws = null;
  }

  void _ingest(String payload) {
    try {
      final json = jsonDecode(payload) as Map<String, dynamic>;
      final fresh = Alert.fromJson(json);
      // De-dupe in case the same id was already fetched via HTTP.
      _alerts = [
        fresh,
        ..._alerts.where((a) => a.id != fresh.id),
      ];
      notifyListeners();
    } catch (_) {
      // Heartbeats and non-JSON frames are expected; ignore.
    }
  }

  Future<void> markRead(int id) async {
    // Optimistic update — the partial-index query is cheap, but the bell
    // badge feels snappier when local state moves immediately.
    _alerts = _alerts
        .map((a) => a.id == id ? a.markRead() : a)
        .toList(growable: false);
    notifyListeners();
    try {
      await _dio.post<void>(ApiEndpoint.alertRead(id));
    } on DioException {
      // 404 from the server (already read or not yours) doesn't undo the
      // optimistic update — it just means we were already in sync.
    }
  }

  Future<void> markAllRead() async {
    final now = DateTime.now();
    _alerts = _alerts
        .map((a) => a.isRead
            ? a
            : Alert(
                id: a.id,
                owner: a.owner,
                kind: a.kind,
                severity: a.severity,
                title: a.title,
                body: a.body,
                data: a.data,
                readAt: now,
                createdAt: a.createdAt,
              ))
        .toList(growable: false);
    notifyListeners();
    try {
      await _dio.post<void>(ApiEndpoint.alertsReadAll);
    } on DioException {
      // Same reasoning as markRead — optimistic update stays.
    }
  }

  /// Confirms a pending spend. Returns true on success. Backend marks the
  /// linked alert read as part of the decision; we mirror that locally.
  Future<bool> approveSpend(int pendingSpendId, int alertId) async {
    try {
      await _dio.post<void>(ApiEndpoint.spendApprove(pendingSpendId));
      await markRead(alertId);
      return true;
    } on DioException {
      return false;
    }
  }

  Future<bool> rejectSpend(int pendingSpendId, int alertId) async {
    try {
      await _dio.post<void>(ApiEndpoint.spendReject(pendingSpendId));
      await markRead(alertId);
      return true;
    } on DioException {
      return false;
    }
  }

  @override
  void dispose() {
    _ws?.dispose();
    super.dispose();
  }
}
