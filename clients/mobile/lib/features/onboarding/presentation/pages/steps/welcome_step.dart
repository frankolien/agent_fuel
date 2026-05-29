import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../../app/theme.dart';
import '../../bloc/onboarding_bloc.dart';
import '../../bloc/onboarding_event.dart';
import '../../widgets/onboarding_scaffold.dart';

class WelcomeStep extends StatelessWidget {
  const WelcomeStep({super.key});

  @override
  Widget build(BuildContext context) {
    return OnboardingScaffold(
      cta: OnboardingCta(
        label: 'Get started',
        onPressed: () =>
            context.read<OnboardingBloc>().add(const OnboardingNext()),
      ),
      secondaryCta: OnboardingCta(
        label: 'I already have agents',
        onPressed: () =>
            context.read<OnboardingBloc>().add(const OnboardingSkipped()),
      ),
      child: const _WelcomeBody(),
    );
  }
}

class _WelcomeBody extends StatelessWidget {
  const _WelcomeBody();

  @override
  Widget build(BuildContext context) {
    final mono = Theme.of(context).extension<AFTypography>()!.mono;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        const Spacer(),
        Container(
          width: 120,
          height: 120,
          decoration: BoxDecoration(
            color: AFColors.surface2,
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: AFColors.line2),
            boxShadow: const [BoxShadow(color: AFColors.mintGlow, blurRadius: 28)],
          ),
          alignment: Alignment.center,
          child: const _BrandMark(size: 56),
        ),
        const SizedBox(height: 40),
        const StepTitle(
          lead: 'Fuel your',
          accent: 'autonomous agents.',
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 16),
        const StepSubtitle(
          'Give every AI agent a budget-bound credit vault and an on-chain '
          'reputation — in about a minute.',
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 20),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: AFColors.surface2,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AFColors.line2),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 6,
                height: 6,
                decoration: const BoxDecoration(
                  color: AFColors.mint,
                  shape: BoxShape.circle,
                  boxShadow: [BoxShadow(color: AFColors.mintGlow, blurRadius: 8)],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                'mainnet-beta',
                style: mono.bodyMedium?.copyWith(color: AFColors.fg2),
              ),
            ],
          ),
        ),
        const Spacer(flex: 2),
      ],
    );
  }
}

class _BrandMark extends StatelessWidget {
  const _BrandMark({required this.size});
  final double size;

  @override
  Widget build(BuildContext context) => CustomPaint(
        size: Size(size, size),
        painter: _BrandPainter(),
      );
}

class _BrandPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 22;
    Offset p(double x, double y) => Offset(x * s, y * s);

    final stroke = Paint()
      ..color = AFColors.mint
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4 * s
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final shape = Path()
      ..moveTo(p(4, 14).dx, p(4, 14).dy)
      ..lineTo(p(11, 4).dx, p(11, 4).dy)
      ..lineTo(p(18, 14).dx, p(18, 14).dy)
      ..lineTo(p(14.5, 14).dx, p(14.5, 14).dy)
      ..lineTo(p(11, 9).dx, p(11, 9).dy)
      ..lineTo(p(7.5, 14).dx, p(7.5, 14).dy)
      ..close();
    canvas.drawPath(shape, stroke);

    canvas.drawLine(p(7, 16), p(15, 16), stroke);
    canvas.drawLine(p(11, 18.5), p(11, 19.5), stroke);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
