import 'package:flutter/material.dart';

import '../../../../app/theme.dart';

enum _AlertSeverity { urgent, info }

class _Alert {
  const _Alert({
    required this.severity,
    required this.icon,
    required this.title,
    required this.body,
    required this.timeAgo,
    this.primaryAction,
    this.secondaryAction,
    this.primaryIcon,
  });
  final _AlertSeverity severity;
  final IconData icon;
  final String title;
  final String body;
  final String timeAgo;
  final String? primaryAction;
  final IconData? primaryIcon;
  final String? secondaryAction;
}

class AlertsScreen extends StatefulWidget {
  const AlertsScreen({super.key});

  @override
  State<AlertsScreen> createState() => _AlertsScreenState();
}

class _AlertsScreenState extends State<AlertsScreen> {
  final List<_Alert> _alerts = const [
    _Alert(
      severity: _AlertSeverity.urgent,
      icon: Icons.warning_amber_rounded,
      title: 'Approval required · large spend',
      body:
          'An agent wants to pay \$14.22 to Cortex Inference — above its per-tx limit.',
      timeAgo: 'just now',
      primaryAction: 'Review',
      primaryIcon: Icons.fingerprint,
      secondaryAction: 'Dismiss',
    ),
    _Alert(
      severity: _AlertSeverity.urgent,
      icon: Icons.trending_down,
      title: 'Reputation dropped 18 pts',
      body:
          'An agent fell below 500 after a failed settlement streak. Consider freezing.',
      timeAgo: '12m ago',
      secondaryAction: 'Freeze vault',
    ),
    _Alert(
      severity: _AlertSeverity.info,
      icon: Icons.bolt_outlined,
      title: 'Agent crossed Elite tier',
      body:
          'Reputation reached 900. Post-pay credit unlocks for whitelisted services.',
      timeAgo: '1h ago',
    ),
    _Alert(
      severity: _AlertSeverity.info,
      icon: Icons.arrow_downward,
      title: 'Vault funded · 2,000 USDC',
      body:
          'A deposit just landed on chain. New available balance reflected in Fleet.',
      timeAgo: '3h ago',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final mono = Theme.of(context).extension<AFTypography>()!.mono;
    return ListView(
      padding: const EdgeInsets.fromLTRB(0, 4, 0, 110),
      children: [
        _AlertsNav(unreadCount: _alerts.length),
        for (final a in _alerts) _AlertCard(alert: a, mono: mono),
      ],
    );
  }
}

class _AlertsNav extends StatelessWidget {
  const _AlertsNav({required this.unreadCount});
  final int unreadCount;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 6,
                height: 6,
                decoration: const BoxDecoration(
                  color: AFColors.danger,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 7),
              Text(
                '$unreadCount UNREAD',
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
    );
  }
}

class _AlertCard extends StatelessWidget {
  const _AlertCard({required this.alert, required this.mono});
  final _Alert alert;
  final TextTheme mono;

  @override
  Widget build(BuildContext context) {
    final urgent = alert.severity == _AlertSeverity.urgent;
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
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _AlertIcon(icon: alert.icon, urgent: urgent),
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
                  alert.timeAgo,
                  style: mono.bodySmall?.copyWith(
                    color: AFColors.muted2,
                    fontSize: 11,
                  ),
                ),
                if (alert.primaryAction != null ||
                    alert.secondaryAction != null) ...[
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      if (alert.primaryAction != null)
                        _AlertButton(
                          label: alert.primaryAction!,
                          icon: alert.primaryIcon,
                          mint: true,
                          onTap: () {},
                        ),
                      if (alert.primaryAction != null &&
                          alert.secondaryAction != null)
                        const SizedBox(width: 8),
                      if (alert.secondaryAction != null)
                        _AlertButton(
                          label: alert.secondaryAction!,
                          mint: false,
                          onTap: () {},
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AlertIcon extends StatelessWidget {
  const _AlertIcon({required this.icon, required this.urgent});
  final IconData icon;
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
        icon,
        color: urgent ? AFColors.danger : AFColors.mint,
        size: 22,
      ),
    );
  }
}

class _AlertButton extends StatelessWidget {
  const _AlertButton({
    required this.label,
    required this.mint,
    required this.onTap,
    this.icon,
  });
  final String label;
  final bool mint;
  final IconData? icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: mint ? AFColors.mint : AFColors.surface2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: BorderSide(
          color: mint ? Colors.transparent : AFColors.line,
        ),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: SizedBox(
          height: 36,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (icon != null) ...[
                  Icon(
                    icon,
                    size: 16,
                    color: mint ? const Color(0xFF0A0B0C) : AFColors.fg,
                  ),
                  const SizedBox(width: 6),
                ],
                Text(
                  label,
                  style: TextStyle(
                    color: mint ? const Color(0xFF0A0B0C) : AFColors.fg,
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
