import 'package:flutter/material.dart';

import '../../../../app/theme.dart';
import '../../domain/entities/activity_event.dart';
import 'activity_feed.dart';

class ActivityScreen extends StatefulWidget {
  const ActivityScreen({super.key});

  @override
  State<ActivityScreen> createState() => _ActivityScreenState();
}

class _ActivityScreenState extends State<ActivityScreen> {
  ActivityKind? _filter;

  @override
  void initState() {
    super.initState();
    ActivityFeed.instance.addListener(_onFeed);
  }

  @override
  void dispose() {
    ActivityFeed.instance.removeListener(_onFeed);
    super.dispose();
  }

  void _onFeed() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final all = ActivityFeed.instance.events;
    final rows = _filter == null
        ? all
        : all.where((e) => e.kind == _filter).toList(growable: false);
    final mono = Theme.of(context).extension<AFTypography>()!.mono;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _ActivityNav(),
        const _Chips(),
        Expanded(
          child: rows.isEmpty
              ? const _EmptyFeed()
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 110),
                  itemCount: rows.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 2),
                  itemBuilder: (_, i) =>
                      _ActivityRow(event: rows[i], mono: mono),
                ),
        ),
      ],
    );
  }

  void _setFilter(ActivityKind? f) {
    setState(() => _filter = f);
  }
}

class _ActivityNav extends StatelessWidget {
  const _ActivityNav();

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
                  color: AFColors.mint,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(color: AFColors.mintGlow, blurRadius: 8),
                  ],
                ),
              ),
              const SizedBox(width: 7),
              const Text(
                'LIVE · STREAMING',
                style: TextStyle(
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
            'Activity',
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

class _Chips extends StatelessWidget {
  const _Chips();

  static const _options = <(String, ActivityKind?)>[
    ('All', null),
    ('Spend', ActivityKind.spend),
    ('Claim', ActivityKind.claim),
    ('Score', ActivityKind.score),
    ('Deposit', ActivityKind.deposit),
    ('Freeze', ActivityKind.freeze),
  ];

  @override
  Widget build(BuildContext context) {
    final parent = context.findAncestorStateOfType<_ActivityScreenState>();
    final current = parent?._filter;
    return SizedBox(
      height: 46,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 14),
        itemCount: _options.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final (label, kind) = _options[i];
          final selected = current == kind;
          return _ChipPill(
            label: label,
            selected: selected,
            onTap: () => parent?._setFilter(kind),
          );
        },
      ),
    );
  }
}

class _ChipPill extends StatelessWidget {
  const _ChipPill({
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AFColors.mint : AFColors.surface,
      shape: StadiumBorder(
        side: BorderSide(
          color: selected ? Colors.transparent : AFColors.line,
        ),
      ),
      child: InkWell(
        onTap: onTap,
        customBorder: const StadiumBorder(),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                color: selected ? const Color(0xFF0A0B0C) : AFColors.muted,
                fontSize: 13,
                fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ActivityRow extends StatelessWidget {
  const _ActivityRow({required this.event, required this.mono});
  final ActivityEvent event;
  final TextTheme mono;

  @override
  Widget build(BuildContext context) {
    final amt = _amountText(event);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    _TypePill(kind: event.kind, mono: mono),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        _short(event.agentPubkey),
                        style: mono.bodyMedium?.copyWith(
                          color: AFColors.fg,
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Flexible(
                      child: _verb(event, mono),
                    ),
                  ],
                ),
                if (event.signature != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Text(
                      event.signature!,
                      style: mono.bodySmall?.copyWith(
                        color: AFColors.muted2,
                        fontSize: 11,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (amt != null)
                Text(
                  amt,
                  style: mono.bodyMedium?.copyWith(
                    color: event.kind == ActivityKind.claim
                        ? AFColors.fg
                        : AFColors.mint,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              const SizedBox(height: 2),
              Text(
                _ago(event.at),
                style: mono.bodySmall?.copyWith(
                  color: AFColors.muted2,
                  fontSize: 11,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _verb(ActivityEvent e, TextTheme mono) {
    switch (e.kind) {
      case ActivityKind.spend:
        return Text(
          '→ ${e.service ?? 'service'}',
          style: const TextStyle(color: AFColors.muted, fontSize: 13),
          overflow: TextOverflow.ellipsis,
        );
      case ActivityKind.claim:
        return Text(
          '← ${e.service ?? 'service'}',
          style: const TextStyle(color: AFColors.muted, fontSize: 13),
          overflow: TextOverflow.ellipsis,
        );
      case ActivityKind.deposit:
        return const Text(
          'vault funded',
          style: TextStyle(color: AFColors.muted, fontSize: 13),
        );
      case ActivityKind.score:
        final up = (e.scoreDelta ?? 0) >= 0;
        return RichText(
          text: TextSpan(
            text: 'score ${up ? '↑' : '↓'} ',
            style: const TextStyle(color: AFColors.muted, fontSize: 13),
            children: [
              TextSpan(
                text: '${up ? '+' : ''}${e.scoreDelta}',
                style: TextStyle(
                  color: up ? AFColors.mint : AFColors.danger,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        );
      case ActivityKind.freeze:
        return const Text(
          'vault frozen',
          style: TextStyle(color: AFColors.muted, fontSize: 13),
        );
    }
  }

  String? _amountText(ActivityEvent e) {
    final amt = e.amountUsdc;
    if (amt == null) return null;
    if (amt < 0.01) return '\$${amt.toStringAsFixed(4)}';
    if (amt < 1) return '\$${amt.toStringAsFixed(3)}';
    if (amt < 1000) return '\$${amt.toStringAsFixed(2)}';
    return '\$${(amt / 1000).toStringAsFixed(2)}K';
  }
}

class _TypePill extends StatelessWidget {
  const _TypePill({required this.kind, required this.mono});
  final ActivityKind kind;
  final TextTheme mono;

  @override
  Widget build(BuildContext context) {
    final (label, bg, fg) = _style(kind);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: mono.labelSmall?.copyWith(
          color: fg,
          fontSize: 9.5,
          letterSpacing: 1.14,
          fontWeight: FontWeight.w500,
          height: 1.3,
        ),
      ),
    );
  }

  (String, Color, Color) _style(ActivityKind k) {
    switch (k) {
      case ActivityKind.spend:
        return ('SPEND', AFColors.mintTint, AFColors.mint);
      case ActivityKind.deposit:
        return ('DEPOSIT', const Color(0x2ED9F0E8), AFColors.mint);
      case ActivityKind.claim:
        return ('CLAIM', const Color(0x14FFFFFF), AFColors.fg);
      case ActivityKind.score:
        return ('SCORE', const Color(0x1AB8E2D4), AFColors.mintDim);
      case ActivityKind.freeze:
        return ('FREEZE', const Color(0x29E08577), AFColors.danger);
    }
  }
}

class _EmptyFeed extends StatelessWidget {
  const _EmptyFeed();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.fromLTRB(32, 0, 32, 110),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.bolt_outlined, color: AFColors.muted, size: 36),
            SizedBox(height: 12),
            Text(
              'Quiet on the wire',
              style: TextStyle(
                color: AFColors.fg,
                fontSize: 17,
                fontWeight: FontWeight.w600,
              ),
            ),
            SizedBox(height: 6),
            Text(
              'New spends, deposits, and score moves stream in here as your '
              'agents transact.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AFColors.muted, height: 1.5),
            ),
          ],
        ),
      ),
    );
  }
}

String _short(String pk, [int n = 4]) =>
    pk.length <= n * 2 ? pk : '${pk.substring(0, n)}…${pk.substring(pk.length - n)}';

String _ago(DateTime at) {
  final s = DateTime.now().difference(at).inSeconds.abs();
  if (s < 60) return '${s}s';
  if (s < 3600) return '${s ~/ 60}m';
  if (s < 86400) return '${s ~/ 3600}h';
  return '${s ~/ 86400}d';
}
