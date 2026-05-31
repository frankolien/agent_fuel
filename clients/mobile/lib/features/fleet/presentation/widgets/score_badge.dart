import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../app/theme.dart';

/// Reputation ring as used in `m-arow` (fleet row) and `m-ring` icon.
class RepRing extends StatelessWidget {
  const RepRing({
    super.key,
    required this.score,
    this.size = 46,
    this.status = RepRingStatus.active,
    this.approximate = false,
  });

  final int score;
  final double size;
  final RepRingStatus status;
  // True when `score` is a client-side approximation pending the next
  // on-chain ScoreComputed event. Renders the number in muted ink to
  // signal "not yet final" without dropping back to the '—' placeholder.
  final bool approximate;

  @override
  Widget build(BuildContext context) {
    final mono = Theme.of(context).extension<AFTypography>()!.mono;
    final color = approximate ? AFColors.muted : _color(status);
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          CustomPaint(
            size: Size(size, size),
            painter: _RepRingPainter(
              fraction: (score / 1000).clamp(0.0, 1.0),
              color: color,
              glow: status != RepRingStatus.frozen,
            ),
          ),
          Text(
            score <= 0 ? '—' : score.toString(),
            style: mono.bodyMedium?.copyWith(
              color: color,
              fontWeight: FontWeight.w600,
              fontSize: size * 0.285,
              letterSpacing: -0.4,
              height: 1,
            ),
          ),
        ],
      ),
    );
  }

  Color _color(RepRingStatus s) {
    switch (s) {
      case RepRingStatus.active:
        return AFColors.mint;
      case RepRingStatus.warning:
        return AFColors.watch;
      case RepRingStatus.frozen:
        return AFColors.muted;
    }
  }
}

enum RepRingStatus { active, warning, frozen }

class _RepRingPainter extends CustomPainter {
  _RepRingPainter({
    required this.fraction,
    required this.color,
    required this.glow,
  });
  final double fraction;
  final Color color;
  final bool glow;

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = size.shortestSide * 0.065;
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.shortestSide / 2 - stroke / 2 - 1;

    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..color = AFColors.surface3
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke,
    );

    if (fraction <= 0) return;

    final arc = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = stroke;

    if (glow) {
      arc.maskFilter = const MaskFilter.blur(BlurStyle.solid, 0.5);
    }

    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -math.pi / 2,
      math.pi * 2 * fraction,
      false,
      arc,
    );

    if (glow) {
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        -math.pi / 2,
        math.pi * 2 * fraction,
        false,
        Paint()
          ..color = color.withValues(alpha: 0.45)
          ..style = PaintingStyle.stroke
          ..strokeCap = StrokeCap.round
          ..strokeWidth = stroke + 4
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4),
      );
    }
  }

  @override
  bool shouldRepaint(covariant _RepRingPainter old) =>
      old.fraction != fraction || old.color != color || old.glow != glow;
}
