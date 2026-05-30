import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../../app/theme.dart';
import '../../../../../core/ui/onchain_error_card.dart';
import '../../bloc/onboarding_bloc.dart';
import '../../bloc/onboarding_event.dart';
import '../../bloc/onboarding_state.dart';
import '../../widgets/onboarding_scaffold.dart';

class WalletStep extends StatelessWidget {
  const WalletStep({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<OnboardingBloc>().state;
    if (state is! OnboardingWallet) return const SizedBox.shrink();
    final retry = state.error != null;
    return OnboardingScaffold(
      cta: OnboardingCta(
        label: state.busy
            ? 'Signing in…'
            : retry
                ? 'Try again'
                : 'Sign in with Solana',
        onPressed: state.busy
            ? null
            : () => context
                .read<OnboardingBloc>()
                .add(const WalletSignInRequested()),
      ),
      child: const _WalletBody(),
    );
  }
}

class _WalletBody extends StatelessWidget {
  const _WalletBody();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<OnboardingBloc>().state;
    if (state is! OnboardingWallet) return const SizedBox.shrink();
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        const StepEyebrow(index: 1, label: 'SIGN IN'),
        const SizedBox(height: 14),
        const StepTitle(lead: 'Sign in with', accent: 'Solana'),
        const SizedBox(height: 14),
        const StepSubtitle(
          'Your wallet will open twice — once to authorize Agent Fuel, '
          'then to sign a sign-in message. No gas, no transaction.',
        ),
        const SizedBox(height: 26),
        if (state.busy)
          const _SigningInTile()
        else
          const _IdleTile(),
        if (state.error != null) ...[
          const SizedBox(height: 14),
          OnchainErrorCard(error: OnchainErrorState(state.error!)),
        ],
        const SizedBox(height: 18),
        const _CompatibilityRow(),
      ],
    );
  }
}

class _IdleTile extends StatelessWidget {
  const _IdleTile();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AFColors.surface2,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AFColors.line2),
      ),
      child: const Row(
        children: [
          Icon(Icons.account_balance_wallet_outlined,
              color: AFColors.mint, size: 24),
          SizedBox(width: 14),
          Expanded(
            child: Text(
              'Tap below — Android shows your installed wallets, you pick one, '
              'approve, and you\'re in.',
              style: TextStyle(color: AFColors.fg, height: 1.45),
            ),
          ),
        ],
      ),
    );
  }
}

class _SigningInTile extends StatelessWidget {
  const _SigningInTile();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 22),
      decoration: BoxDecoration(
        color: AFColors.surface2,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AFColors.line2),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: AFColors.mint,
            ),
          ),
          SizedBox(width: 14),
          Expanded(
            child: Text(
              'Check your wallet — approve the authorize sheet, then approve '
              'the sign-in message that follows.',
              style: TextStyle(color: AFColors.muted, height: 1.45),
            ),
          ),
        ],
      ),
    );
  }
}

class _CompatibilityRow extends StatelessWidget {
  const _CompatibilityRow();

  @override
  Widget build(BuildContext context) {
    return const Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        _CompatChip(label: 'Phantom'),
        _CompatChip(label: 'Solflare'),
        _CompatChip(label: 'Backpack'),
        _CompatChip(label: 'Seed Vault'),
        _CompatChip(label: 'Ultimate'),
      ],
    );
  }
}

class _CompatChip extends StatelessWidget {
  const _CompatChip({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: AFColors.surface2,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AFColors.line2),
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: AFColors.muted,
          fontSize: 12,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}
