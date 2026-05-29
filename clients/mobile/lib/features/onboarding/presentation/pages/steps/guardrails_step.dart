import 'package:flutter/material.dart';
import 'package:flutter/services.dart'
    show TextEditingValue, TextInputFormatter;
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../../app/theme.dart';
import '../../../domain/entities/onboarding_flow.dart';
import '../../bloc/onboarding_bloc.dart';
import '../../bloc/onboarding_event.dart';
import '../../bloc/onboarding_state.dart';
import '../../widgets/onboarding_scaffold.dart';

class GuardrailsStep extends StatelessWidget {
  const GuardrailsStep({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<OnboardingBloc>().state;
    if (state is! OnboardingGuardrails) return const SizedBox.shrink();
    return OnboardingScaffold(
      cta: OnboardingCta(
        label: state.submitting ? 'Authorizing…' : 'Authorize with biometric',
        icon: state.submitting ? null : Icons.fingerprint,
        onPressed: state.submitting
            ? null
            : () => context
                .read<OnboardingBloc>()
                .add(const OnboardingAuthorized()),
      ),
      child: const _GuardrailsBody(),
    );
  }
}

class _GuardrailsBody extends StatelessWidget {
  const _GuardrailsBody();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<OnboardingBloc>().state;
    if (state is! OnboardingGuardrails) return const SizedBox.shrink();
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        const StepEyebrow(index: 4, label: 'GUARDRAILS'),
        const SizedBox(height: 14),
        const StepTitle(lead: 'Set', accent: 'spend limits'),
        const SizedBox(height: 14),
        const StepSubtitle(
          'Enforced on-chain before every payment. You can fine-tune any limit later in the console.',
        ),
        const SizedBox(height: 22),
        for (final profile in RiskProfile.values) ...[
          _RiskCard(
            profile: profile,
            selected: state.flow.riskProfile == profile,
          ),
          const SizedBox(height: 14),
        ],
      ],
    );
  }
}

class _RiskCard extends StatelessWidget {
  const _RiskCard({required this.profile, required this.selected});
  final RiskProfile profile;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final mono = Theme.of(context).extension<AFTypography>()!.mono;
    final preset = PolicyPreset.presets[profile]!;
    final state = context.watch<OnboardingBloc>().state;
    final flow = state.flow;
    final isCustom = profile == RiskProfile.custom;
    return Material(
      color: AFColors.surface2,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () =>
            context.read<OnboardingBloc>().add(RiskProfileChanged(profile)),
        child: Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: selected ? AFColors.mint : AFColors.line2,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      preset.title,
                      style: const TextStyle(
                        color: AFColors.fg,
                        fontSize: 19,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  _RadioMark(selected: selected),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                preset.blurb,
                style: const TextStyle(color: AFColors.muted, fontSize: 13.5, height: 1.45),
              ),
              const SizedBox(height: 18),
              if (isCustom && selected)
                _CustomLimits(
                  perTx: flow.customMaxPerTxUsdc,
                  perHour: flow.customMaxPerHourUsdc,
                  mono: mono,
                )
              else
                Row(
                  children: [
                    _Stat(
                      label: 'MAX / TX',
                      value: isCustom
                          ? '\$${_fmtUsd(flow.customMaxPerTxUsdc)}'
                          : '\$${preset.maxPerTxUsdc}',
                      mono: mono,
                    ),
                    const SizedBox(width: 22),
                    _Stat(
                      label: 'MAX / HR',
                      value: isCustom
                          ? '\$${_fmtUsd(flow.customMaxPerHourUsdc)}'
                          : '\$${preset.maxPerHourUsdc}',
                      mono: mono,
                    ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CustomLimits extends StatelessWidget {
  const _CustomLimits({
    required this.perTx,
    required this.perHour,
    required this.mono,
  });

  final double perTx;
  final double perHour;
  final TextTheme mono;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: _LimitField(
            label: 'MAX / TX',
            value: perTx,
            mono: mono,
            onChanged: (v) => context
                .read<OnboardingBloc>()
                .add(CustomMaxPerTxChanged(v)),
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: _LimitField(
            label: 'MAX / HR',
            value: perHour,
            mono: mono,
            onChanged: (v) => context
                .read<OnboardingBloc>()
                .add(CustomMaxPerHourChanged(v)),
          ),
        ),
      ],
    );
  }
}

class _LimitField extends StatefulWidget {
  const _LimitField({
    required this.label,
    required this.value,
    required this.mono,
    required this.onChanged,
  });

  final String label;
  final double value;
  final TextTheme mono;
  final ValueChanged<double> onChanged;

  @override
  State<_LimitField> createState() => _LimitFieldState();
}

class _LimitFieldState extends State<_LimitField> {
  late final TextEditingController _controller =
      TextEditingController(text: _formatExternal(widget.value));
  final FocusNode _focus = FocusNode();

  @override
  void didUpdateWidget(_LimitField old) {
    super.didUpdateWidget(old);
    final external = _formatExternal(widget.value);
    if (!_focus.hasFocus && _controller.text != external) {
      _controller.text = external;
    }
  }

  String _formatExternal(double v) {
    if (v == v.truncateToDouble()) return v.toStringAsFixed(0);
    return v.toStringAsFixed(2);
  }

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          widget.label,
          style: widget.mono.labelSmall?.copyWith(
            color: AFColors.muted,
            letterSpacing: 1.1,
          ),
        ),
        const SizedBox(height: 4),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: AFColors.surface3,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AFColors.line2),
          ),
          child: Row(
            children: [
              Text(
                '\$',
                style: widget.mono.titleMedium?.copyWith(
                  color: AFColors.muted,
                  fontSize: 20,
                ),
              ),
              const SizedBox(width: 2),
              Expanded(
                child: TextField(
                  controller: _controller,
                  focusNode: _focus,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  inputFormatters: [_DecimalUsdFormatter()],
                  cursorColor: AFColors.mint,
                  decoration: const InputDecoration(
                    isCollapsed: true,
                    border: InputBorder.none,
                    contentPadding: EdgeInsets.symmetric(vertical: 12),
                  ),
                  style: widget.mono.titleMedium?.copyWith(
                    color: AFColors.fg,
                    fontWeight: FontWeight.w700,
                    fontSize: 20,
                  ),
                  onChanged: (v) {
                    if (v.isEmpty || v == '.') {
                      widget.onChanged(0);
                      return;
                    }
                    final n = double.tryParse(v);
                    if (n == null || n < 0) return;
                    widget.onChanged(n);
                  },
                  onSubmitted: (_) => _focus.unfocus(),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _RadioMark extends StatelessWidget {
  const _RadioMark({required this.selected});
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 22,
      height: 22,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: selected ? AFColors.mint : AFColors.line,
          width: 1.5,
        ),
      ),
      alignment: Alignment.center,
      child: selected
          ? Container(
              width: 10,
              height: 10,
              decoration: const BoxDecoration(
                color: AFColors.mint,
                shape: BoxShape.circle,
                boxShadow: [BoxShadow(color: AFColors.mintGlow, blurRadius: 8)],
              ),
            )
          : null,
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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: mono.labelSmall?.copyWith(
            color: AFColors.muted,
            letterSpacing: 1.1,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: mono.titleMedium?.copyWith(
            color: AFColors.fg,
            fontWeight: FontWeight.w700,
            fontSize: 20,
          ),
        ),
      ],
    );
  }
}

String _fmtUsd(double v) {
  if (v == v.truncateToDouble()) return v.toStringAsFixed(0);
  return v.toStringAsFixed(2);
}

class _DecimalUsdFormatter extends TextInputFormatter {
  static final _re = RegExp(r'^\d{0,7}(\.\d{0,2})?$');

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    if (newValue.text.isEmpty) return newValue;
    if (_re.hasMatch(newValue.text)) return newValue;
    return oldValue;
  }
}
