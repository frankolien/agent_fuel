import 'package:flutter/material.dart';
import 'package:get_it/get_it.dart';

import '../../../../app/theme.dart';
import '../../../../core/error/exceptions.dart';
import '../../../alerts/data/repositories/alerts_repository.dart';
import '../../../alerts/domain/entities/alert.dart';
import '../../../auth/data/datasources/biometric_service.dart';
import '../../../wallet/data/repositories/wallet_repository.dart';
import '../../data/onchain/vault_action_service.dart';

class AlertsScreen extends StatefulWidget {
  const AlertsScreen({super.key});

  @override
  State<AlertsScreen> createState() => _AlertsScreenState();
}

class _AlertsScreenState extends State<AlertsScreen> {
  late final AlertsRepository _repo;

  @override
  void initState() {
    super.initState();
    _repo = GetIt.I<AlertsRepository>();
    _repo.addListener(_onRepo);
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final wallet = await GetIt.I<WalletRepository>().cachedConnection();
    if (wallet != null) _repo.watch(wallet.pubkeyBase58);
    await _repo.refresh();
  }

  void _onRepo() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _repo.removeListener(_onRepo);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mono = Theme.of(context).extension<AFTypography>()!.mono;
    final alerts = _repo.alerts;
    final unread = _repo.unreadCount;
    return RefreshIndicator(
      color: AFColors.mint,
      backgroundColor: AFColors.surface,
      onRefresh: () => _repo.refresh(silent: true),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(0, 4, 0, 110),
        children: [
          _AlertsNav(
            unreadCount: unread,
            onMarkAll: alerts.any((a) => !a.isRead) ? _repo.markAllRead : null,
          ),
          if (_repo.loading && alerts.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 80),
              child: Center(
                child: CircularProgressIndicator(color: AFColors.mint),
              ),
            )
          else if (_repo.error != null && alerts.isEmpty)
            _ErrorPanel(message: _repo.error!, onRetry: _bootstrap)
          else if (alerts.isEmpty)
            const _EmptyPanel()
          else
            for (final a in alerts)
              _AlertCard(
                alert: a,
                mono: mono,
                onReview: _onReview,
                onReject: _onReject,
                onDismiss: () => _repo.markRead(a.id),
              ),
        ],
      ),
    );
  }

  Future<void> _onReview(Alert alert) async {
    if (!alert.requiresApproval) {
      await _repo.markRead(alert.id);
      return;
    }
    if (alert.pendingSpendId == null && alert.pendingSpendPubkey == null) {
      // Nothing to release. Treat Review as acknowledge.
      await _repo.markRead(alert.id);
      return;
    }

    final approved = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      barrierColor: const Color(0x99000000),
      builder: (_) => _ApproveSpendSheet(alert: alert),
    );

    if (!mounted || approved != true) return;
    // The sheet already submitted the on-chain tx (and the backend marker
    // for the linked alert). Fallback path for legacy off-chain alerts:
    // POST the marker now so the badge clears.
    if (alert.pendingSpendPubkey == null && alert.pendingSpendId != null) {
      await _repo.approveSpend(alert.pendingSpendId!, alert.id);
    }
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        backgroundColor: AFColors.surface2,
        content: Text(
          'Spend approved',
          style: TextStyle(color: AFColors.fg),
        ),
      ),
    );
  }

  Future<void> _onReject(Alert alert) async {
    if (!alert.requiresApproval) {
      await _repo.markRead(alert.id);
      return;
    }
    final pendingPubkey = alert.pendingSpendPubkey;
    final agentPubkey = alert.agentPubkey;
    final pendingId = alert.pendingSpendId;

    // Pure off-chain alert (no on-chain queue entry) — just dismiss.
    if (pendingPubkey == null || agentPubkey == null) {
      if (pendingId != null) {
        await _repo.rejectSpend(pendingId, alert.id);
      } else {
        await _repo.markRead(alert.id);
      }
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      barrierColor: const Color(0x99000000),
      builder: (_) => const _RejectConfirmDialog(),
    );
    if (!mounted || confirmed != true) return;

    final wallet = await GetIt.I<WalletRepository>().cachedConnection();
    if (!mounted) return;
    if (wallet == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          backgroundColor: AFColors.surface2,
          content: Text(
            'Wallet session lost. Reconnect from onboarding.',
            style: TextStyle(color: AFColors.danger),
          ),
        ),
      );
      return;
    }

    try {
      await GetIt.I<VaultActionService>().cancelSpend(
        ownerPubkeyBase58: wallet.pubkeyBase58,
        agentPubkeyBase58: agentPubkey,
        walletAuthToken: wallet.authToken,
        pendingSpendPubkeyBase58: pendingPubkey,
      );
      if (pendingId != null) {
        await _repo.rejectSpend(pendingId, alert.id);
      } else {
        await _repo.markRead(alert.id);
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          backgroundColor: AFColors.surface2,
          content: Text(
            'Spend rejected',
            style: TextStyle(color: AFColors.fg),
          ),
        ),
      );
    } on WalletException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AFColors.surface2,
          content: Text(
            e.message,
            style: const TextStyle(color: AFColors.danger),
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AFColors.surface2,
          content: Text(
            'Reject failed: $e',
            style: const TextStyle(color: AFColors.danger),
          ),
        ),
      );
    }
  }
}

class _AlertsNav extends StatelessWidget {
  const _AlertsNav({required this.unreadCount, this.onMarkAll});
  final int unreadCount;
  final VoidCallback? onMarkAll;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        color: unreadCount > 0
                            ? AFColors.danger
                            : AFColors.muted2,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 7),
                    Text(
                      unreadCount > 0
                          ? '$unreadCount UNREAD'
                          : 'ALL CAUGHT UP',
                      style: const TextStyle(
                        color: AFColors.mintDim,
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        letterSpacing: 1.76,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 3),
                const Text(
                  'Alerts',
                  style: TextStyle(
                    color: AFColors.fg,
                    fontSize: 32,
                    fontWeight: FontWeight.w600,
                    letterSpacing: -0.96,
                    height: 1,
                  ),
                ),
              ],
            ),
          ),
          if (onMarkAll != null)
            TextButton(
              onPressed: onMarkAll,
              child: const Text(
                'Mark all',
                style: TextStyle(color: AFColors.mint, fontSize: 13),
              ),
            ),
        ],
      ),
    );
  }
}

class _AlertCard extends StatelessWidget {
  const _AlertCard({
    required this.alert,
    required this.mono,
    required this.onReview,
    required this.onReject,
    required this.onDismiss,
  });

  final Alert alert;
  final TextTheme mono;
  final Future<void> Function(Alert) onReview;
  final Future<void> Function(Alert) onReject;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final urgent = alert.isUrgent && !alert.isRead;
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: urgent
            ? const LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0x0FE08577), Color(0x00E08577)],
              )
            : null,
        color: urgent ? null : AFColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: urgent ? const Color(0x66E08577) : AFColors.line,
        ),
      ),
      child: Opacity(
        opacity: alert.isRead ? 0.6 : 1,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _AlertIcon(kind: alert.kind, urgent: urgent),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    alert.title,
                    style: const TextStyle(
                      color: AFColors.fg,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    alert.body,
                    style: const TextStyle(
                      color: AFColors.muted,
                      fontSize: 13,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _ago(alert.createdAt),
                    style: mono.bodySmall?.copyWith(
                      color: AFColors.muted2,
                      fontSize: 11,
                    ),
                  ),
                  if (!alert.isRead) ...[
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        if (alert.requiresApproval) ...[
                          _AlertButton(
                            label: 'Review',
                            icon: Icons.fingerprint,
                            mint: true,
                            onTap: () => onReview(alert),
                          ),
                          const SizedBox(width: 8),
                          _AlertButton(
                            label: 'Reject',
                            danger: true,
                            onTap: () => onReject(alert),
                          ),
                        ] else ...[
                          _AlertButton(
                            label: 'Acknowledge',
                            mint: true,
                            onTap: onDismiss,
                          ),
                          const SizedBox(width: 8),
                          _AlertButton(
                            label: 'Dismiss',
                            mint: false,
                            onTap: onDismiss,
                          ),
                        ],
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AlertIcon extends StatelessWidget {
  const _AlertIcon({required this.kind, required this.urgent});
  final AlertKind kind;
  final bool urgent;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        color: urgent ? const Color(0x24E08577) : AFColors.surface3,
        borderRadius: BorderRadius.circular(11),
      ),
      child: Icon(
        _iconFor(kind),
        color: urgent ? AFColors.danger : AFColors.mint,
        size: 22,
      ),
    );
  }

  IconData _iconFor(AlertKind k) {
    switch (k) {
      case AlertKind.approvalRequired:
        return Icons.fingerprint;
      case AlertKind.budgetThreshold:
        return Icons.speed;
      case AlertKind.scoreChange:
        return Icons.trending_down;
      case AlertKind.tierCrossed:
        return Icons.bolt_outlined;
      case AlertKind.vaultFunded:
        return Icons.arrow_downward;
      case AlertKind.vaultFrozen:
        return Icons.ac_unit;
      case AlertKind.unknown:
        return Icons.notifications_none_rounded;
    }
  }
}

class _AlertButton extends StatelessWidget {
  const _AlertButton({
    required this.label,
    required this.onTap,
    this.mint = false,
    this.danger = false,
    this.icon,
  });
  final String label;
  final bool mint;
  final bool danger;
  final IconData? icon;
  final VoidCallback onTap;

  Color get _bg => danger
      ? AFColors.danger
      : mint
          ? AFColors.mint
          : AFColors.surface2;
  Color get _fg => danger
      ? const Color(0xFF1A0A08)
      : mint
          ? const Color(0xFF0A0B0C)
          : AFColors.fg;
  Color get _border =>
      (mint || danger) ? Colors.transparent : AFColors.line;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: _bg,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: BorderSide(color: _border),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: SizedBox(
          height: 36,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (icon != null) ...[
                  Icon(icon, size: 16, color: _fg),
                  const SizedBox(width: 6),
                ],
                Text(
                  label,
                  style: TextStyle(
                    color: _fg,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RejectConfirmDialog extends StatelessWidget {
  const _RejectConfirmDialog();

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: const Color(0xFF0C0D0F),
      shape: RoundedRectangleBorder(
        side: const BorderSide(color: AFColors.line2),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(22, 22, 22, 18),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: const BoxDecoration(
                color: Color(0x29E08577),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.block,
                color: AFColors.danger,
                size: 28,
              ),
            ),
            const SizedBox(height: 14),
            const Text(
              'Reject spend?',
              style: TextStyle(
                color: AFColors.fg,
                fontSize: 18,
                fontWeight: FontWeight.w600,
                letterSpacing: -0.36,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'The pending request will be closed on chain and the agent '
              "won't be able to retry without filing a new one.",
              textAlign: TextAlign.center,
              style: TextStyle(
                color: AFColors.muted,
                fontSize: 13.5,
                height: 1.45,
              ),
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: SizedBox(
                    height: 46,
                    child: Material(
                      color: AFColors.surface2,
                      shape: RoundedRectangleBorder(
                        side: const BorderSide(color: AFColors.line),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: InkWell(
                        onTap: () => Navigator.of(context).pop(false),
                        borderRadius: BorderRadius.circular(14),
                        child: const Center(
                          child: Text(
                            'Cancel',
                            style: TextStyle(
                              color: AFColors.fg,
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: SizedBox(
                    height: 46,
                    child: Material(
                      color: AFColors.danger,
                      borderRadius: BorderRadius.circular(14),
                      child: InkWell(
                        onTap: () => Navigator.of(context).pop(true),
                        borderRadius: BorderRadius.circular(14),
                        child: const Center(
                          child: Text(
                            'Reject',
                            style: TextStyle(
                              color: Color(0xFF1A0A08),
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyPanel extends StatelessWidget {
  const _EmptyPanel();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.fromLTRB(32, 60, 32, 60),
      child: Column(
        children: [
          Icon(Icons.notifications_none_rounded,
              color: AFColors.muted, size: 36),
          SizedBox(height: 12),
          Text(
            'No alerts',
            style: TextStyle(
              color: AFColors.fg,
              fontSize: 17,
              fontWeight: FontWeight.w600,
            ),
          ),
          SizedBox(height: 6),
          Text(
            "You'll see budget pings, score moves, and approval requests here.",
            textAlign: TextAlign.center,
            style: TextStyle(color: AFColors.muted, height: 1.5),
          ),
        ],
      ),
    );
  }
}

class _ErrorPanel extends StatelessWidget {
  const _ErrorPanel({required this.message, required this.onRetry});
  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(32, 60, 32, 60),
      child: Column(
        children: [
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AFColors.danger, fontSize: 14),
          ),
          const SizedBox(height: 14),
          FilledButton(
            onPressed: () => onRetry(),
            child: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}

class _ApproveSpendSheet extends StatefulWidget {
  const _ApproveSpendSheet({required this.alert});
  final Alert alert;

  @override
  State<_ApproveSpendSheet> createState() => _ApproveSpendSheetState();
}

enum _ScanPhase { review, scanning, submitting, done }

class _ApproveSpendSheetState extends State<_ApproveSpendSheet> {
  _ScanPhase _phase = _ScanPhase.review;
  String? _error;

  Future<void> _scan() async {
    setState(() {
      _phase = _ScanPhase.scanning;
      _error = null;
    });
    final ok = await GetIt.I<BiometricService>().authorize(
      'Approve this over-limit spend',
    );
    if (!mounted) return;
    if (!ok) {
      setState(() {
        _phase = _ScanPhase.review;
        _error = 'Biometric cancelled. Tap again to retry.';
      });
      return;
    }

    // No on-chain context (legacy/off-chain alert) — fall through to the
    // backend-only marker path; the screen handler runs `repo.approveSpend`
    // after we pop.
    final pendingPubkey = widget.alert.pendingSpendPubkey;
    final agentPubkey = widget.alert.agentPubkey;
    if (pendingPubkey == null || agentPubkey == null) {
      setState(() => _phase = _ScanPhase.done);
      await Future<void>.delayed(const Duration(milliseconds: 500));
      if (!mounted) return;
      Navigator.of(context).pop(true);
      return;
    }

    setState(() => _phase = _ScanPhase.submitting);
    final wallet = await GetIt.I<WalletRepository>().cachedConnection();
    if (!mounted) return;
    if (wallet == null) {
      setState(() {
        _phase = _ScanPhase.review;
        _error = 'Wallet session lost. Reconnect from onboarding.';
      });
      return;
    }

    final pendingId = widget.alert.pendingSpendId;
    try {
      await GetIt.I<VaultActionService>().approveSpend(
        ownerPubkeyBase58: wallet.pubkeyBase58,
        agentPubkeyBase58: agentPubkey,
        walletAuthToken: wallet.authToken,
        pendingSpendPubkeyBase58: pendingPubkey,
        serviceOwnerBase58: widget.alert.servicePubkey ?? '',
      );
      // Backend marker is best-effort — the on-chain Spent event will sync
      // pending_spends via the webhook regardless, but flipping the row now
      // closes the alert badge in the same trip.
      if (pendingId != null) {
        await GetIt.I<AlertsRepository>()
            .approveSpend(pendingId, widget.alert.id);
      } else {
        await GetIt.I<AlertsRepository>().markRead(widget.alert.id);
      }
      if (!mounted) return;
      setState(() => _phase = _ScanPhase.done);
      await Future<void>.delayed(const Duration(milliseconds: 700));
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on WalletException catch (e) {
      if (!mounted) return;
      setState(() {
        _phase = _ScanPhase.review;
        _error = e.message;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _phase = _ScanPhase.review;
        _error = 'Approval failed: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final mono = Theme.of(context).extension<AFTypography>()!.mono;
    final amt = widget.alert.amountUsdc;
    final svc = widget.alert.serviceLabel;
    final agent = widget.alert.agentPubkey;
    return AnimatedPadding(
      duration: const Duration(milliseconds: 150),
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Container(
        decoration: const BoxDecoration(
          color: Color(0xFF0C0D0F),
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
          border: Border(top: BorderSide(color: AFColors.line2)),
        ),
        padding: EdgeInsets.fromLTRB(
          20,
          12,
          20,
          28 + MediaQuery.of(context).padding.bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 38,
              height: 5,
              margin: const EdgeInsets.only(bottom: 18),
              decoration: BoxDecoration(
                color: const Color(0x2EFFFFFF),
                borderRadius: BorderRadius.circular(100),
              ),
            ),
            const Text(
              'Approve spend',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: AFColors.fg,
                fontSize: 22,
                fontWeight: FontWeight.w600,
                letterSpacing: -0.44,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'This payment is above the per-tx limit. Confirm with biometrics to release it.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: AFColors.muted,
                fontSize: 14,
                height: 1.45,
              ),
            ),
            const SizedBox(height: 22),
            if (_phase == _ScanPhase.done)
              _CheckMark()
            else ...[
              Text(
                amt == null ? '—' : '\$${amt.toStringAsFixed(2)}',
                textAlign: TextAlign.center,
                style: mono.displayMedium?.copyWith(
                  color: AFColors.mint,
                  fontSize: 52,
                  fontWeight: FontWeight.w600,
                  letterSpacing: -1.82,
                  height: 1,
                  shadows: const [
                    Shadow(color: AFColors.mintGlow, blurRadius: 28),
                  ],
                ),
              ),
              const SizedBox(height: 6),
              Text(
                svc == null ? 'over per-tx limit' : 'to ${_short(svc)}',
                textAlign: TextAlign.center,
                style: const TextStyle(color: AFColors.muted, fontSize: 13),
              ),
              const SizedBox(height: 18),
              if (agent != null)
                _Row(k: 'Agent', v: _short(agent), mono: mono),
              if (svc != null)
                _Row(k: 'Service', v: _short(svc), mono: mono, last: true),
              if (_phase == _ScanPhase.scanning) ...[
                const SizedBox(height: 24),
                const Icon(Icons.fingerprint, color: AFColors.mint, size: 64),
                const SizedBox(height: 10),
                const Text(
                  'Scanning…',
                  style: TextStyle(color: AFColors.muted, fontSize: 14),
                ),
              ],
              if (_phase == _ScanPhase.submitting) ...[
                const SizedBox(height: 24),
                const CircularProgressIndicator(
                  color: AFColors.mint,
                  strokeWidth: 2.5,
                ),
                const SizedBox(height: 10),
                const Text(
                  'Confirm in wallet…',
                  style: TextStyle(color: AFColors.muted, fontSize: 14),
                ),
              ],
            ],
            if (_error != null) ...[
              const SizedBox(height: 14),
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AFColors.danger, fontSize: 13),
              ),
            ],
            const SizedBox(height: 18),
            if (_phase == _ScanPhase.review)
              _MintButton(
                label: 'Authorize with biometric',
                icon: Icons.fingerprint,
                onPressed: _scan,
              ),
            if (_phase == _ScanPhase.review)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: _GhostButton(
                  label: 'Cancel',
                  onPressed: () => Navigator.of(context).pop(false),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _CheckMark extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 80,
      height: 80,
      decoration: const BoxDecoration(
        color: AFColors.mintTint,
        shape: BoxShape.circle,
      ),
      child: const Icon(Icons.check, color: AFColors.mint, size: 40),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.k,
    required this.v,
    required this.mono,
    this.last = false,
  });
  final String k;
  final String v;
  final TextTheme mono;
  final bool last;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(
        border: last
            ? null
            : const Border(
                bottom: BorderSide(color: AFColors.line),
              ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              k,
              style: const TextStyle(color: AFColors.muted, fontSize: 14),
            ),
          ),
          Text(
            v,
            style: mono.bodyMedium?.copyWith(color: AFColors.fg, fontSize: 14),
          ),
        ],
      ),
    );
  }
}

class _MintButton extends StatelessWidget {
  const _MintButton({
    required this.label,
    required this.onPressed,
    this.icon,
  });
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 52,
      width: double.infinity,
      child: Material(
        color: AFColors.mint,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(16),
          child: Center(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (icon != null) ...[
                  Icon(icon, size: 18, color: const Color(0xFF0A0B0C)),
                  const SizedBox(width: 8),
                ],
                Text(
                  label,
                  style: const TextStyle(
                    color: Color(0xFF0A0B0C),
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _GhostButton extends StatelessWidget {
  const _GhostButton({required this.label, required this.onPressed});
  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 52,
      width: double.infinity,
      child: Material(
        color: AFColors.surface2,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AFColors.line),
        ),
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(16),
          child: const Center(
            child: Text(
              'Cancel',
              style: TextStyle(
                color: AFColors.fg,
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

String _short(String pk, [int n = 4]) =>
    pk.length <= n * 2 ? pk : '${pk.substring(0, n)}…${pk.substring(pk.length - n)}';

String _ago(DateTime at) {
  final s = DateTime.now().difference(at).inSeconds.abs();
  if (s < 60) return 'just now';
  if (s < 3600) return '${s ~/ 60}m ago';
  if (s < 86400) return '${s ~/ 3600}h ago';
  return '${s ~/ 86400}d ago';
}
