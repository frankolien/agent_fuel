import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../app/theme.dart';
import '../bloc/onboarding_bloc.dart';
import '../bloc/onboarding_event.dart';

const _segments = 6;

class OnboardingScaffold extends StatelessWidget {
  const OnboardingScaffold({
    super.key,
    required this.child,
    required this.cta,
    this.secondaryCta,
  });

  final Widget child;
  final OnboardingCta cta;
  final OnboardingCta? secondaryCta;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<OnboardingBloc>().state;
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 12),
              _TopBar(showBack: state.hasBack, showSkip: state.hasSkip),
              const SizedBox(height: 24),
              Expanded(child: child),
              const SizedBox(height: 12),
              _CtaRow(primary: cta, secondary: secondaryCta),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}

class OnboardingCta {
  const OnboardingCta({
    required this.label,
    required this.onPressed,
    this.icon,
    this.muted = false,
  });
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool muted;
}

class _TopBar extends StatelessWidget {
  const _TopBar({required this.showBack, required this.showSkip});
  final bool showBack;
  final bool showSkip;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<OnboardingBloc>().state;
    return Row(
      children: [
        if (showBack)
          _CircleIcon(
            icon: Icons.chevron_left,
            onTap: () =>
                context.read<OnboardingBloc>().add(const OnboardingBack()),
          )
        else
          const SizedBox(width: 36),
        const SizedBox(width: 12),
        Expanded(child: _ProgressBar(active: state.progressIndex)),
        if (showSkip) ...[
          const SizedBox(width: 12),
          TextButton(
            style: TextButton.styleFrom(
              foregroundColor: AFColors.muted,
              padding: EdgeInsets.zero,
              minimumSize: const Size(40, 32),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            onPressed: () =>
                context.read<OnboardingBloc>().add(const OnboardingSkipped()),
            child: const Text('Skip'),
          ),
        ],
      ],
    );
  }
}

class _ProgressBar extends StatelessWidget {
  const _ProgressBar({required this.active});
  final int active; // 1..6

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < _segments; i++) ...[
          if (i > 0) const SizedBox(width: 6),
          Expanded(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              height: 3,
              decoration: BoxDecoration(
                color: i < active ? AFColors.mint : AFColors.surface3,
                borderRadius: BorderRadius.circular(2),
                boxShadow: i < active
                    ? [
                        const BoxShadow(
                          color: AFColors.mintGlow,
                          blurRadius: 8,
                        ),
                      ]
                    : null,
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _CircleIcon extends StatelessWidget {
  const _CircleIcon({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkResponse(
      onTap: onTap,
      radius: 22,
      child: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: AFColors.surface2,
          shape: BoxShape.circle,
          border: Border.all(color: AFColors.line2),
        ),
        alignment: Alignment.center,
        child: Icon(icon, color: AFColors.fg, size: 22),
      ),
    );
  }
}

class _CtaRow extends StatelessWidget {
  const _CtaRow({required this.primary, this.secondary});
  final OnboardingCta primary;
  final OnboardingCta? secondary;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _CtaButton(cta: primary, primary: true),
        if (secondary != null) ...[
          const SizedBox(height: 12),
          _CtaButton(cta: secondary!, primary: false),
        ],
      ],
    );
  }
}

class _CtaButton extends StatelessWidget {
  const _CtaButton({required this.cta, required this.primary});
  final OnboardingCta cta;
  final bool primary;

  @override
  Widget build(BuildContext context) {
    final mono = Theme.of(context).extension<AFTypography>()!.mono;
    final enabled = cta.onPressed != null;
    final bg = primary ? AFColors.mint : AFColors.surface;
    final fg = primary ? AFColors.bg : AFColors.fg;
    return Opacity(
      opacity: enabled ? 1 : 0.45,
      child: SizedBox(
        width: double.infinity,
        height: 56,
        child: Material(
          color: bg,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(28),
            side: primary
                ? BorderSide.none
                : const BorderSide(color: AFColors.line2),
          ),
          child: InkWell(
            onTap: enabled ? cta.onPressed : null,
            borderRadius: BorderRadius.circular(28),
            child: Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(28),
                boxShadow: primary && enabled
                    ? const [BoxShadow(color: AFColors.mintGlow, blurRadius: 18)]
                    : null,
              ),
              alignment: Alignment.center,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (cta.icon != null) ...[
                    Icon(cta.icon, color: fg, size: 20),
                    const SizedBox(width: 10),
                  ],
                  Text(
                    cta.label,
                    style: (primary ? mono.titleMedium : mono.titleSmall)
                            ?.copyWith(
                          color: fg,
                          fontWeight: FontWeight.w600,
                        ) ??
                        TextStyle(color: fg),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class StepEyebrow extends StatelessWidget {
  const StepEyebrow({super.key, required this.index, required this.label});
  final int index;
  final String label;

  @override
  Widget build(BuildContext context) {
    final mono = Theme.of(context).extension<AFTypography>()!.mono;
    return Text(
      'STEP $index  ·  $label',
      style: mono.labelMedium?.copyWith(
        color: AFColors.muted,
        letterSpacing: 1.2,
      ),
    );
  }
}

class StepTitle extends StatelessWidget {
  const StepTitle({
    super.key,
    required this.lead,
    required this.accent,
    this.textAlign = TextAlign.start,
  });
  final String lead;
  final String accent;
  final TextAlign textAlign;

  @override
  Widget build(BuildContext context) {
    return RichText(
      textAlign: textAlign,
      text: TextSpan(
        style: const TextStyle(
          color: AFColors.fg,
          fontSize: 32,
          fontWeight: FontWeight.w700,
          height: 1.15,
        ),
        children: [
          TextSpan(text: '$lead '),
          TextSpan(
            text: accent,
            style: const TextStyle(
              color: AFColors.mint,
              shadows: [Shadow(color: AFColors.mintGlow, blurRadius: 18)],
            ),
          ),
        ],
      ),
    );
  }
}

class StepSubtitle extends StatelessWidget {
  const StepSubtitle(this.text, {super.key, this.textAlign = TextAlign.start});
  final String text;
  final TextAlign textAlign;

  @override
  Widget build(BuildContext context) => Text(
        text,
        textAlign: textAlign,
        style: const TextStyle(color: AFColors.muted, fontSize: 15, height: 1.5),
      );
}
