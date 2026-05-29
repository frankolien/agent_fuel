import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../../app/theme.dart';
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
    final flow = state.flow;
    final ctaLabel = flow.walletConnected
        ? 'Continue'
        : state.connecting
            ? 'Connecting…'
            : 'Connect wallet';
    final ctaEnabled = !state.connecting;
    return OnboardingScaffold(
      cta: OnboardingCta(
        label: ctaLabel,
        onPressed: !ctaEnabled
            ? null
            : flow.walletConnected
                ? () =>
                    context.read<OnboardingBloc>().add(const OnboardingNext())
                : () => context
                    .read<OnboardingBloc>()
                    .add(const WalletConnectRequested()),
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
    final flow = state.flow;
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        const StepEyebrow(index: 1, label: 'WALLET'),
        const SizedBox(height: 14),
        const StepTitle(lead: 'Connect your', accent: 'wallet'),
        const SizedBox(height: 14),
        const StepSubtitle(
          'Tap Connect — Android shows your installed wallets. Works with '
          'Phantom, Solflare, Backpack, Seeker\'s Seed Vault, and any '
          'MWA-compatible wallet.',
        ),
        const SizedBox(height: 26),
        if (flow.walletConnected)
          _ConnectedCard(pubkey: flow.ownerPubkey!)
        else if (state.connecting)
          const _ConnectingTile()
        else
          const _IdleTile(),
        if (state.error != null) ...[
          const SizedBox(height: 14),
          _ErrorBanner(message: state.error!),
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
              'Tap Connect wallet to pick yours from Android\'s system chooser.',
              style: TextStyle(color: AFColors.fg, height: 1.45),
            ),
          ),
        ],
      ),
    );
  }
}

class _ConnectingTile extends StatelessWidget {
  const _ConnectingTile();

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
              'Waiting for the wallet to authorize…',
              style: TextStyle(color: AFColors.muted),
            ),
          ),
        ],
      ),
    );
  }
}

class _ConnectedCard extends StatelessWidget {
  const _ConnectedCard({required this.pubkey});
  final String pubkey;

  String get _short {
    if (pubkey.length <= 12) return pubkey;
    return '${pubkey.substring(0, 6)}…${pubkey.substring(pubkey.length - 6)}';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AFColors.surface2,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AFColors.mint, width: 1.5),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: AFColors.mint.withValues(alpha: 0.18),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.check, color: AFColors.mint, size: 24),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Wallet connected',
                  style: TextStyle(
                    color: AFColors.fg,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  _short,
                  style: const TextStyle(
                    color: AFColors.muted,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: () => context
                .read<OnboardingBloc>()
                .add(const WalletDisconnectRequested()),
            style: TextButton.styleFrom(foregroundColor: AFColors.muted),
            child: const Text('Disconnect'),
          ),
        ],
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AFColors.danger.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AFColors.danger.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: AFColors.danger, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(color: AFColors.fg, height: 1.4),
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
