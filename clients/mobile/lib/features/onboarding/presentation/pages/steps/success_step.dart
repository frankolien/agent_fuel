import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../../app/router.dart';
import '../../../../../app/theme.dart';
import '../../../domain/entities/onboarding_flow.dart';
import '../../bloc/onboarding_bloc.dart';
import '../../widgets/onboarding_scaffold.dart';

class SuccessStep extends StatelessWidget {
  const SuccessStep({super.key});

  @override
  Widget build(BuildContext context) {
    return OnboardingScaffold(
      cta: OnboardingCta(
        label: 'Enter Fleet',
        onPressed: () => context.router.replaceAll([const FleetRoute()]),
      ),
      child: const _SuccessBody(),
    );
  }
}

class _SuccessBody extends StatelessWidget {
  const _SuccessBody();

  @override
  Widget build(BuildContext context) {
    final mono = Theme.of(context).extension<AFTypography>()!.mono;
    final state = context.watch<OnboardingBloc>().state;
    final flow = state.flow;
    final preset = PolicyPreset.presets[flow.riskProfile]!;
    final handle = flow.handle.isEmpty ? 'your agent' : flow.handle;
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        const SizedBox(height: 12),
        Center(
          child: Container(
            width: 120,
            height: 120,
            decoration: const BoxDecoration(
              color: AFColors.surface2,
              shape: BoxShape.circle,
              boxShadow: [BoxShadow(color: AFColors.mintGlow, blurRadius: 32)],
            ),
            alignment: Alignment.center,
            child: Container(
              width: 110,
              height: 110,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: AFColors.mint, width: 1.5),
              ),
              alignment: Alignment.center,
              child: const Icon(Icons.check, color: AFColors.mint, size: 56),
            ),
          ),
        ),
        const SizedBox(height: 28),
        RichText(
          textAlign: TextAlign.center,
          text: TextSpan(
            style: const TextStyle(
              color: AFColors.fg,
              fontSize: 32,
              fontWeight: FontWeight.w700,
              height: 1.15,
            ),
            children: [
              TextSpan(
                text: '$handle ',
                style: const TextStyle(
                  color: AFColors.mint,
                  shadows: [Shadow(color: AFColors.mintGlow, blurRadius: 18)],
                ),
              ),
              const TextSpan(text: 'is fueled up'),
            ],
          ),
        ),
        const SizedBox(height: 16),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 8),
          child: Text(
            'Your agent is live on mainnet with a funded vault and reputation tracking enabled.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AFColors.muted, fontSize: 15, height: 1.5),
          ),
        ),
        const SizedBox(height: 28),
        _SummaryRow(label: 'Vault balance', value: '\$${flow.depositUsdc} USDC', mono: mono),
        const SizedBox(height: 10),
        _SummaryRow(label: 'Framework', value: flow.framework.label, mono: mono),
        const SizedBox(height: 10),
        _SummaryRow(
          label: 'Spend limits',
          value: '\$${preset.maxPerTxUsdc} tx  ·  \$${preset.maxPerHourUsdc} hr',
          mono: mono,
        ),
        const SizedBox(height: 10),
        _SummaryRow(label: 'Reputation', value: '000 · new', mono: mono),
      ],
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({required this.label, required this.value, required this.mono});
  final String label;
  final String value;
  final TextTheme mono;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: AFColors.surface2,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AFColors.line2),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: const TextStyle(color: AFColors.muted, fontSize: 15)),
          ),
          Text(
            value,
            style: mono.bodyMedium?.copyWith(color: AFColors.fg, fontSize: 15),
          ),
        ],
      ),
    );
  }
}
