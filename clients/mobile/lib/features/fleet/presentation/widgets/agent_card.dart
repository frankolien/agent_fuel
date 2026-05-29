import 'package:flutter/material.dart';

import '../../../../app/theme.dart';
import '../../domain/entities/agent.dart';

class AgentCardView extends StatelessWidget {
  const AgentCardView({super.key, required this.agent});
  final Agent agent;

  @override
  Widget build(BuildContext context) {
    final mono = Theme.of(context).extension<AFTypography>()!.mono;
    final scoreText = agent.isScored
        ? agent.score.toString().padLeft(3, '0')
        : '—';
    final scoreColor = agent.isScored ? AFColors.mint : AFColors.muted;
    final fraction = (agent.score / 1000).clamp(0.0, 1.0);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _Header(pubkey: agent.pubkey, mono: mono),
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  scoreText,
                  style: mono.headlineMedium?.copyWith(
                    color: scoreColor,
                    fontWeight: FontWeight.w500,
                    height: 1,
                  ),
                ),
                const SizedBox(width: 8),
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Text(
                    '/ 1000',
                    style: mono.bodySmall?.copyWith(color: AFColors.muted),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _ProgressBar(fraction: fraction, scored: agent.isScored),
            const SizedBox(height: 14),
            const Divider(color: AFColors.line2, height: 1),
            const SizedBox(height: 12),
            Row(
              children: [
                _Stat(label: 'TX', value: _fmtCompact(agent.totalTransactions), mono: mono),
                _Stat(label: 'VOLUME', value: '\$${_fmtUsdc(agent.totalVolumeUsdc)}', mono: mono),
                _Stat(label: 'STREAK', value: _fmtCompact(agent.consecutiveSuccess), mono: mono),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.pubkey, required this.mono});
  final String pubkey;
  final TextTheme mono;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            _shortPubkey(pubkey, 6),
            style: mono.bodyMedium?.copyWith(color: AFColors.fg),
            overflow: TextOverflow.ellipsis,
          ),
        ),
        const Icon(Icons.chevron_right, color: AFColors.muted, size: 18),
      ],
    );
  }
}

class _ProgressBar extends StatelessWidget {
  const _ProgressBar({required this.fraction, required this.scored});
  final double fraction;
  final bool scored;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(2),
      child: Container(
        height: 4,
        color: AFColors.surface2,
        child: Align(
          alignment: Alignment.centerLeft,
          child: FractionallySizedBox(
            widthFactor: fraction,
            child: Container(
              decoration: BoxDecoration(
                color: scored ? AFColors.mint : AFColors.surface3,
                boxShadow: scored
                    ? const [BoxShadow(color: AFColors.mintGlow, blurRadius: 10)]
                    : null,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value, required this.mono});
  final String label;
  final String value;
  final TextTheme mono;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: mono.labelSmall?.copyWith(
              color: AFColors.muted,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: mono.bodyMedium?.copyWith(color: AFColors.fg2),
          ),
        ],
      ),
    );
  }
}

String _shortPubkey(String pk, [int n = 4]) =>
    pk.length <= n * 2 ? pk : '${pk.substring(0, n)}…${pk.substring(pk.length - n)}';

String _fmtCompact(int n) {
  if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
  if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}K';
  return n.toString();
}

String _fmtUsdc(int micro) {
  final usd = micro / 1000000;
  if (usd >= 1000) return '${(usd / 1000).toStringAsFixed(2)}K';
  return usd.toStringAsFixed(2);
}
