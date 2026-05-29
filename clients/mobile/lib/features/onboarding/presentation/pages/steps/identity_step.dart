import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../../app/theme.dart';
import '../../../domain/entities/onboarding_flow.dart';
import '../../bloc/onboarding_bloc.dart';
import '../../bloc/onboarding_event.dart';
import '../../bloc/onboarding_state.dart';
import '../../widgets/onboarding_scaffold.dart';

class IdentityStep extends StatelessWidget {
  const IdentityStep({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<OnboardingBloc>().state;
    if (state is! OnboardingIdentity) return const SizedBox.shrink();
    return OnboardingScaffold(
      cta: OnboardingCta(
        label: 'Continue',
        onPressed: state.flow.handleValid
            ? () => context.read<OnboardingBloc>().add(const OnboardingNext())
            : null,
      ),
      child: const _IdentityBody(),
    );
  }
}

class _IdentityBody extends StatefulWidget {
  const _IdentityBody();

  @override
  State<_IdentityBody> createState() => _IdentityBodyState();
}

class _IdentityBodyState extends State<_IdentityBody> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(
      text: context.read<OnboardingBloc>().state.flow.handle,
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mono = Theme.of(context).extension<AFTypography>()!.mono;
    final state = context.watch<OnboardingBloc>().state;
    if (state is! OnboardingIdentity) return const SizedBox.shrink();
    // ListView lets the body scroll when the IME pushes the form upward —
    // a fixed Column would clip and trigger a RenderFlex overflow.
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        const StepEyebrow(index: 2, label: 'IDENTITY'),
        const SizedBox(height: 14),
        const StepTitle(lead: 'Name your first', accent: 'agent'),
        const SizedBox(height: 14),
        const StepSubtitle(
          "A label you'll recognize in the fleet. The on-chain account is a PDA derived from your wallet.",
        ),
        const SizedBox(height: 26),
        Text(
          'AGENT HANDLE',
          style: mono.labelMedium?.copyWith(
            color: AFColors.muted,
            letterSpacing: 1.2,
          ),
        ),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
          decoration: BoxDecoration(
            color: AFColors.surface2,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AFColors.line2),
          ),
          child: TextField(
            controller: _controller,
            onChanged: (v) =>
                context.read<OnboardingBloc>().add(HandleChanged(v)),
            style: mono.titleMedium?.copyWith(color: AFColors.fg) ??
                const TextStyle(color: AFColors.fg, fontSize: 18),
            decoration: const InputDecoration(
              hintText: 'atlas-mm-01',
              hintStyle: TextStyle(color: AFColors.muted),
              border: InputBorder.none,
              contentPadding: EdgeInsets.symmetric(vertical: 14),
            ),
          ),
        ),
        const SizedBox(height: 28),
        Text(
          'FRAMEWORK',
          style: mono.labelMedium?.copyWith(
            color: AFColors.muted,
            letterSpacing: 1.2,
          ),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            for (final f in AgentFramework.values)
              _FrameworkChip(framework: f, selected: state.flow.framework == f),
          ],
        ),
      ],
    );
  }
}

class _FrameworkChip extends StatelessWidget {
  const _FrameworkChip({required this.framework, required this.selected});
  final AgentFramework framework;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AFColors.mint : AFColors.surface2,
      shape: StadiumBorder(
        side: BorderSide(
          color: selected ? AFColors.mint : AFColors.line2,
        ),
      ),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: () => context
            .read<OnboardingBloc>()
            .add(FrameworkChanged(framework)),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Text(
            framework.label,
            style: TextStyle(
              color: selected ? AFColors.bg : AFColors.fg,
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}
