import 'package:flutter/material.dart';

import '../../../../app/theme.dart';
import '../../domain/entities/agent.dart';
import 'score_badge.dart';

/// Compact agent row matching the design's `m-arow`: 46px reputation ring,
/// name + label, right-aligned $remaining + score delta, then a 4px gauge
/// that spans the inner two grid columns.
class AgentCardView extends StatelessWidget {
  const AgentCardView({
    super.key,
    required this.agent,
    this.scoreDelta,
  });

  final Agent agent;
  final int? scoreDelta;

  @override
  Widget build(BuildContext context) {
    final mono = Theme.of(context).extension<AFTypography>()!.mono;
    final fraction = (agent.score / 1000).clamp(0.0, 1.0);
    final value = _fmtUsd(agent.totalVolumeUsdc / 1000000);
    final scoreStatus = !agent.isScored
        ? RepRingStatus.frozen
        : agent.activeNegativeFeedbackCount > 0
            ? RepRingStatus.warning
            : RepRingStatus.active;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        color: AFColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AFColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              RepRing(score: agent.score, status: scoreStatus),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      _shortPubkey(agent.pubkey, 4),
                      style: mono.bodyLarge?.copyWith(
                        color: AFColors.fg,
                        fontWeight: FontWeight.w500,
                        fontSize: 16,
                        letterSpacing: -0.16,
                        height: 1.1,
                      ),
                      overflow: TextOverflow.ellipsis,
                      maxLines: 1,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${_fmtCompact(agent.totalTransactions)} tx · '
                      '${_fmtCompact(agent.servicesUsed)} services',
                      style: const TextStyle(
                        color: AFColors.muted,
                        fontSize: 12.5,
                      ),
                      overflow: TextOverflow.ellipsis,
                      maxLines: 1,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '\$$value',
                    style: mono.bodyLarge?.copyWith(
                      color: AFColors.fg,
                      fontWeight: FontWeight.w600,
                      fontSize: 16,
                      letterSpacing: -0.32,
                      height: 1.1,
                    ),
                  ),
                  const SizedBox(height: 3),
                  _DeltaText(delta: scoreDelta),
                ],
              ),
            ],
          ),
          const SizedBox(height: 10),
          Padding(
            padding: const EdgeInsets.only(left: 60),
            child: _ThinGauge(fraction: fraction, scored: agent.isScored),
          ),
        ],
      ),
    );
  }
}

class _DeltaText extends StatelessWidget {
  const _DeltaText({required this.delta});
  final int? delta;

  @override
  Widget build(BuildContext context) {
    if (delta == null || delta == 0) {
      return const Text(
        '· —',
        style: TextStyle(
          color: AFColors.muted2,
          fontSize: 13,
          fontWeight: FontWeight.w600,
        ),
      );
    }
    final up = delta! > 0;
    return Text(
      '${up ? '▲ +' : '▼ '}${delta!.abs()}',
      style: TextStyle(
        color: up ? AFColors.mint : AFColors.danger,
        fontSize: 13,
        fontWeight: FontWeight.w600,
      ),
    );
  }
}

class _ThinGauge extends StatelessWidget {
  const _ThinGauge({required this.fraction, required this.scored});
  final double fraction;
  final bool scored;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(100),
      child: Container(
        height: 4,
        color: AFColors.surface3,
        child: Align(
          alignment: Alignment.centerLeft,
          child: FractionallySizedBox(
            widthFactor: fraction,
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: scored
                    ? const LinearGradient(
                        colors: [AFColors.mintDim, AFColors.mint],
                      )
                    : null,
                color: scored ? null : AFColors.muted,
                boxShadow: scored
                    ? const [
                        BoxShadow(color: AFColors.mintGlow, blurRadius: 10),
                      ]
                    : null,
              ),
            ),
          ),
        ),
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

String _fmtUsd(double usd) {
  if (usd == 0) return '0.00';
  if (usd >= 1000000) return '${(usd / 1000000).toStringAsFixed(2)}M';
  if (usd >= 1000) return '${(usd / 1000).toStringAsFixed(2)}K';
  return usd.toStringAsFixed(2);
}
