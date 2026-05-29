import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show FilteringTextInputFormatter;
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../../app/theme.dart';
import '../../bloc/onboarding_bloc.dart';
import '../../bloc/onboarding_event.dart';
import '../../bloc/onboarding_state.dart';
import '../../widgets/onboarding_scaffold.dart';

const _minDeposit = 1;
const _maxDeposit = 100000;

class FundStep extends StatelessWidget {
  const FundStep({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<OnboardingBloc>().state;
    final fund = state is OnboardingFund ? state : null;
    final amount = state.flow.depositUsdc;
    final available = fund?.usdcBalanceMicro;
    final hasEnough = available == null || available >= amount * 1000000;
    return OnboardingScaffold(
      cta: OnboardingCta(
        label: hasEnough ? 'Deposit  \$$amount' : 'Not enough USDC',
        onPressed: hasEnough
            ? () => context.read<OnboardingBloc>().add(const OnboardingNext())
            : null,
      ),
      child: const _FundBody(),
    );
  }
}

class _FundBody extends StatelessWidget {
  const _FundBody();

  @override
  Widget build(BuildContext context) {
    final mono = Theme.of(context).extension<AFTypography>()!.mono;
    final state = context.watch<OnboardingBloc>().state;
    final amount = state.flow.depositUsdc;
    final handle = state.flow.handle.isEmpty ? 'agent' : state.flow.handle;
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        const StepEyebrow(index: 3, label: 'FUND'),
        const SizedBox(height: 14),
        const StepTitle(lead: 'Fund the', accent: 'credit vault'),
        const SizedBox(height: 14),
        const StepSubtitle(
          'Deposit USDC the agent can spend. The vault PDA holds it — a leaked agent key can never drain it.',
        ),
        const SizedBox(height: 36),
        Center(child: _BigAmountField(amount: amount)),
        const SizedBox(height: 6),
        Center(
          child: Text(
            'USDC · withdrawable anytime',
            style: mono.bodyMedium?.copyWith(color: AFColors.muted),
          ),
        ),
        const SizedBox(height: 30),
        const _AmountControls(),
        const SizedBox(height: 22),
        const _Progress(),
        const SizedBox(height: 10),
        const _BalanceLine(),
        const SizedBox(height: 6),
        Text(handle, style: mono.bodyMedium?.copyWith(color: AFColors.muted)),
      ],
    );
  }
}

class _BigAmountField extends StatefulWidget {
  const _BigAmountField({required this.amount});
  final int amount;

  @override
  State<_BigAmountField> createState() => _BigAmountFieldState();
}

class _BigAmountFieldState extends State<_BigAmountField> {
  late final TextEditingController _controller =
      TextEditingController(text: widget.amount.toString());
  final FocusNode _focus = FocusNode();

  @override
  void didUpdateWidget(_BigAmountField old) {
    super.didUpdateWidget(old);
    // Sync the field when amount changes externally (preset chip, +/- buttons)
    // — but never while the user is mid-edit, that would yank the caret.
    final external = widget.amount.toString();
    if (!_focus.hasFocus && _controller.text != external) {
      _controller.text = external;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mono = Theme.of(context).extension<AFTypography>()!.mono;
    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 14),
          child: Text(
            '\$',
            style: TextStyle(
              color: AFColors.muted,
              fontSize: 32,
              fontWeight: FontWeight.w600,
              fontFamily: mono.titleLarge?.fontFamily,
            ),
          ),
        ),
        const SizedBox(width: 4),
        IntrinsicWidth(
          child: TextField(
            controller: _controller,
            focusNode: _focus,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            textAlign: TextAlign.center,
            cursorColor: AFColors.mint,
            cursorWidth: 3,
            decoration: const InputDecoration(
              isCollapsed: true,
              border: InputBorder.none,
              contentPadding: EdgeInsets.zero,
            ),
            style: TextStyle(
              color: AFColors.fg,
              fontSize: 80,
              fontWeight: FontWeight.w700,
              height: 1,
              fontFamily: mono.titleLarge?.fontFamily,
              shadows: const [Shadow(color: AFColors.mintGlow, blurRadius: 24)],
            ),
            onChanged: (v) {
              final n = int.tryParse(v);
              if (n == null) return;
              context
                  .read<OnboardingBloc>()
                  .add(DepositChanged(n.clamp(_minDeposit, _maxDeposit)));
            },
            onSubmitted: (_) => _focus.unfocus(),
          ),
        ),
      ],
    );
  }
}

class _BalanceLine extends StatelessWidget {
  const _BalanceLine();

  @override
  Widget build(BuildContext context) {
    final mono = Theme.of(context).extension<AFTypography>()!.mono;
    final state = context.watch<OnboardingBloc>().state;
    if (state is! OnboardingFund) return const SizedBox.shrink();
    final muted = mono.bodyMedium?.copyWith(color: AFColors.muted);

    if (state.loadingBalance) {
      return Row(
        children: [
          const SizedBox(
            width: 12,
            height: 12,
            child: CircularProgressIndicator(strokeWidth: 1.5, color: AFColors.muted),
          ),
          const SizedBox(width: 8),
          Text('Reading devnet balance…', style: muted),
        ],
      );
    }
    if (state.balanceError != null) {
      return Text(
        'Couldn\'t read balance — proceeding with on-screen value.',
        style: mono.bodyMedium?.copyWith(color: AFColors.watch),
      );
    }
    final micro = state.usdcBalanceMicro;
    if (micro == null) return const SizedBox.shrink();
    final usd = micro / 1000000;
    final amount = state.flow.depositUsdc;
    final enough = micro >= amount * 1000000;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'You have \$${usd.toStringAsFixed(2)} on devnet',
          style: mono.bodyMedium?.copyWith(
            color: enough ? AFColors.fg2 : AFColors.watch,
          ),
        ),
        if (!enough) ...[
          const SizedBox(height: 2),
          Text(
            'Get devnet USDC at usdcfaucet.com',
            style: mono.bodySmall?.copyWith(color: AFColors.muted),
          ),
        ],
      ],
    );
  }
}

class _AmountControls extends StatelessWidget {
  const _AmountControls();

  static const presets = [500, 2000, 5000];
  static const step = 100;
  static const minDeposit = 1;
  static const maxDeposit = 100000;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<OnboardingBloc>().state;
    final current = state.flow.depositUsdc;
    void emit(int v) => context
        .read<OnboardingBloc>()
        .add(DepositChanged(v.clamp(minDeposit, maxDeposit)));
    return Row(
      children: [
        _RoundIcon(
          icon: Icons.remove,
          onTap: () => emit(current - step),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Row(
            children: [
              for (var i = 0; i < presets.length; i++) ...[
                if (i > 0) const SizedBox(width: 10),
                Expanded(
                  child: _PresetChip(
                    label: presets[i] >= 1000 ? '\$${presets[i] ~/ 1000}k' : '\$${presets[i]}',
                    selected: current == presets[i],
                    onTap: () => emit(presets[i]),
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(width: 14),
        _RoundIcon(
          icon: Icons.add,
          onTap: () => emit(current + step),
        ),
      ],
    );
  }
}

class _RoundIcon extends StatelessWidget {
  const _RoundIcon({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkResponse(
      onTap: onTap,
      radius: 26,
      child: Container(
        width: 46,
        height: 46,
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

class _PresetChip extends StatelessWidget {
  const _PresetChip({
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
      color: AFColors.surface2,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          height: 46,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected ? AFColors.mint : AFColors.line2,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: AFColors.fg,
              fontSize: 15,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ),
      ),
    );
  }
}

class _Progress extends StatelessWidget {
  const _Progress();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 4,
      decoration: BoxDecoration(
        color: AFColors.mint,
        borderRadius: BorderRadius.circular(2),
        boxShadow: const [BoxShadow(color: AFColors.mintGlow, blurRadius: 12)],
      ),
    );
  }
}
