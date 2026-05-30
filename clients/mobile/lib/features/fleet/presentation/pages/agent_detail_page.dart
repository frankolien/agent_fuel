import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show Clipboard, ClipboardData, HapticFeedback;
import 'package:get_it/get_it.dart';

import '../../../../app/theme.dart';
import '../../../agent_keys/data/datasources/agent_key_store.dart';
import '../../../agent_keys/presentation/export_key_sheet.dart';
import '../../domain/entities/agent.dart';
import '../sheets/vault_action_sheets.dart';

class AgentDetailPage extends StatelessWidget {
  const AgentDetailPage({
    super.key,
    required this.agent,
    this.scoreDelta,
  });

  final Agent agent;
  final int? scoreDelta;

  @override
  Widget build(BuildContext context) {
    final mono = Theme.of(context).extension<AFTypography>()!.mono;
    return Scaffold(
      backgroundColor: AFColors.bg,
      body: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.only(top: 4, bottom: 36),
          children: [
            _DetailNav(active: agent.isScored),
            _DetailHero(agent: agent, mono: mono),
            _DialCard(agent: agent, delta: scoreDelta, mono: mono),
            const SizedBox(height: 4),
            _ActionsRow(agent: agent),
            const SizedBox(height: 6),
            _CreditVaultCard(agent: agent, mono: mono),
          ],
        ),
      ),
    );
  }
}

class _DetailNav extends StatelessWidget {
  const _DetailNav({required this.active});
  final bool active;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 14),
      child: Row(
        children: [
          InkWell(
            onTap: () => Navigator.of(context).maybePop(),
            borderRadius: BorderRadius.circular(8),
            child: const Padding(
              padding: EdgeInsets.symmetric(vertical: 2),
              child: Row(
                children: [
                  Icon(Icons.chevron_left, color: AFColors.mint, size: 22),
                  Text(
                    'Fleet',
                    style: TextStyle(
                      color: AFColors.mint,
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const Spacer(),
          _StatusPill(active: active),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.active});
  final bool active;

  @override
  Widget build(BuildContext context) {
    final color = active ? AFColors.mint : AFColors.muted;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 7,
          height: 7,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: color,
            boxShadow: active
                ? const [BoxShadow(color: AFColors.mintGlow, blurRadius: 10)]
                : null,
          ),
        ),
        const SizedBox(width: 6),
        Text(
          active ? 'ACTIVE' : 'IDLE',
          style: TextStyle(
            color: color,
            fontSize: 11,
            fontWeight: FontWeight.w500,
            letterSpacing: 0.66,
          ),
        ),
      ],
    );
  }
}

class _DetailHero extends StatelessWidget {
  const _DetailHero({required this.agent, required this.mono});
  final Agent agent;
  final TextTheme mono;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 6, 20, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _shortPubkey(agent.pubkey, 4),
            style: mono.headlineSmall?.copyWith(
              color: AFColors.fg,
              fontSize: 24,
              fontWeight: FontWeight.w500,
              letterSpacing: -0.48,
              height: 1.1,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            _label(agent),
            style: const TextStyle(
              color: AFColors.muted,
              fontSize: 14,
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _AddrPill(label: 'AGENT', value: agent.pubkey, mono: mono),
              _AddrPill(label: 'OWNER', value: agent.owner, mono: mono),
            ],
          ),
          _KeyStateRow(agent: agent),
        ],
      ),
    );
  }
}

/// Shows one of three states based on whether this device holds the agent's
/// ed25519 seed:
///   * has seed → mint "Export agent key" chip
///   * no seed, no on-chain funds → nothing (don't nag the user)
///   * no seed, vault has USDC → red "Recover funds" banner
class _KeyStateRow extends StatelessWidget {
  const _KeyStateRow({required this.agent});
  final Agent agent;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<bool>(
      future: GetIt.I<AgentKeyStore>().has(agent.pubkey),
      builder: (context, snap) {
        if (!snap.hasData) return const SizedBox.shrink();
        if (snap.data == true) {
          return Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Material(
                color: AFColors.mintTint,
                shape: const StadiumBorder(),
                child: InkWell(
                  customBorder: const StadiumBorder(),
                  onTap: () => showExportAgentKeySheet(
                    context,
                    agentPubkey: agent.pubkey,
                  ),
                  child: const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.key, color: AFColors.mint, size: 14),
                        SizedBox(width: 6),
                        Text(
                          'Export agent key',
                          style: TextStyle(
                            color: AFColors.mint,
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 0.2,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          );
        }
        return _OrphanedBanner(agent: agent);
      },
    );
  }
}

class _OrphanedBanner extends StatelessWidget {
  const _OrphanedBanner({required this.agent});
  final Agent agent;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Material(
        color: const Color(0x14E08577),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: Color(0x4DE08577)),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () async {
            final ok = await showRecoverSheet(context, agent);
            if (ok == true && context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  backgroundColor: AFColors.surface2,
                  content: Text(
                    'Funds recovered to wallet',
                    style: TextStyle(color: AFColors.fg),
                  ),
                ),
              );
            }
          },
          child: const Padding(
            padding: EdgeInsets.fromLTRB(14, 12, 12, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.lock_outline,
                  color: AFColors.danger,
                  size: 20,
                ),
                SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        "This device can't sign for this agent",
                        style: TextStyle(
                          color: AFColors.fg,
                          fontSize: 13.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      SizedBox(height: 3),
                      Text(
                        'Recover its USDC to your wallet, then create a new agent.',
                        style: TextStyle(
                          color: AFColors.muted,
                          fontSize: 12.5,
                          height: 1.4,
                        ),
                      ),
                    ],
                  ),
                ),
                SizedBox(width: 8),
                Icon(
                  Icons.chevron_right,
                  color: AFColors.danger,
                  size: 20,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AddrPill extends StatelessWidget {
  const _AddrPill({
    required this.label,
    required this.value,
    required this.mono,
  });
  final String label;
  final String value;
  final TextTheme mono;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AFColors.surface2,
      shape: const StadiumBorder(side: BorderSide(color: AFColors.line)),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: () async {
          await Clipboard.setData(ClipboardData(text: value));
          HapticFeedback.selectionClick();
          if (!context.mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              backgroundColor: AFColors.surface2,
              duration: const Duration(milliseconds: 1400),
              content: Text(
                '$label copied · ${_shortPubkey(value, 4)}',
                style: const TextStyle(color: AFColors.fg),
              ),
            ),
          );
        },
        child: Container(
          height: 26,
          padding: const EdgeInsets.symmetric(horizontal: 10),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: const TextStyle(
                  color: AFColors.muted,
                  fontSize: 10,
                  letterSpacing: 0.8,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(width: 6),
              Text(
                _shortPubkey(value, 4),
                style: mono.bodySmall?.copyWith(
                  color: AFColors.fg2,
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(width: 6),
              const Icon(
                Icons.copy_rounded,
                size: 11,
                color: AFColors.muted,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DialCard extends StatelessWidget {
  const _DialCard({
    required this.agent,
    required this.delta,
    required this.mono,
  });
  final Agent agent;
  final int? delta;
  final TextTheme mono;

  @override
  Widget build(BuildContext context) {
    final score = agent.score;
    final tier = _tier(score);
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      padding: const EdgeInsets.symmetric(vertical: 22),
      decoration: BoxDecoration(
        color: AFColors.surface,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: AFColors.line2),
        gradient: const RadialGradient(
          center: Alignment.topCenter,
          radius: 1.1,
          colors: [Color(0x14D9F0E8), Color(0x00D9F0E8)],
          stops: [0, 0.6],
        ),
      ),
      child: Center(
        child: SizedBox(
          width: 200,
          height: 200,
          child: Stack(
            alignment: Alignment.center,
            children: [
              CustomPaint(
                size: const Size(200, 200),
                painter: _DialPainter(
                  fraction: (score / 1000).clamp(0.0, 1.0),
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(top: 24, bottom: 40),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text(
                      'REPUTATION',
                      style: TextStyle(
                        color: AFColors.muted,
                        fontSize: 10,
                        letterSpacing: 2.0,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      score <= 0 ? '—' : score.toString().padLeft(3, '0'),
                      style: mono.displayLarge?.copyWith(
                        color: AFColors.mint,
                        fontSize: 60,
                        fontWeight: FontWeight.w600,
                        height: 1,
                        letterSpacing: -1.8,
                        shadows: const [
                          Shadow(
                            color: AFColors.mintGlow,
                            blurRadius: 24,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 6),
                    _TierLine(tier: tier, delta: delta),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TierLine extends StatelessWidget {
  const _TierLine({required this.tier, required this.delta});
  final String tier;
  final int? delta;

  @override
  Widget build(BuildContext context) {
    final showDelta = delta != null && delta != 0;
    final deltaColor =
        (delta ?? 0) >= 0 ? AFColors.mint : AFColors.danger;
    return Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text(
          tier,
          style: const TextStyle(
            color: AFColors.mintDim,
            fontSize: 10,
            letterSpacing: 1.8,
            fontWeight: FontWeight.w500,
          ),
        ),
        if (showDelta) ...[
          const Text(
            '  ·  ',
            style: TextStyle(color: AFColors.muted, fontSize: 10),
          ),
          Text(
            '${(delta ?? 0) > 0 ? '+' : ''}$delta',
            style: TextStyle(
              color: deltaColor,
              fontSize: 10,
              letterSpacing: 1.4,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ],
    );
  }
}

class _DialPainter extends CustomPainter {
  _DialPainter({required this.fraction});
  final double fraction;

  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2;
    final cy = size.height / 2;
    const r = 90.0;
    const a0 = math.pi * (1 - 0.166);
    final sweep = math.pi * 1.33 * fraction;
    const fullSweep = math.pi * 1.33;
    final rect = Rect.fromCircle(center: Offset(cx, cy), radius: r);

    canvas.drawArc(
      rect,
      a0,
      fullSweep,
      false,
      Paint()
        ..color = const Color(0x1AFFFFFF)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4
        ..strokeCap = StrokeCap.round,
    );

    if (fraction <= 0) return;
    canvas.drawArc(
      rect,
      a0,
      sweep,
      false,
      Paint()
        ..color = AFColors.mint
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4
        ..strokeCap = StrokeCap.round
        ..maskFilter = const MaskFilter.blur(BlurStyle.solid, 1),
    );
    canvas.drawArc(
      rect,
      a0,
      sweep,
      false,
      Paint()
        ..color = AFColors.mintGlow
        ..style = PaintingStyle.stroke
        ..strokeWidth = 10
        ..strokeCap = StrokeCap.round
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6),
    );
  }

  @override
  bool shouldRepaint(covariant _DialPainter old) =>
      old.fraction != fraction;
}

class _ActionsRow extends StatelessWidget {
  const _ActionsRow({required this.agent});
  final Agent agent;

  @override
  Widget build(BuildContext context) {
    Future<void> open(
      Future<bool?> Function(BuildContext, Agent) launcher,
      String successLabel,
    ) async {
      final ok = await launcher(context, agent);
      if (ok != true || !context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AFColors.surface2,
          content: Text(
            successLabel,
            style: const TextStyle(color: AFColors.fg),
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
      child: Row(
        children: [
          Expanded(
            child: _ActionTile(
              icon: Icons.check,
              label: 'Approve',
              onTap: () => open(showApproveSheet, 'Spend approved'),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _ActionTile(
              icon: Icons.arrow_downward,
              label: 'Fund',
              onTap: () => open(showFundSheet, 'Deposit submitted'),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _ActionTile(
              icon: Icons.ac_unit,
              label: 'Freeze',
              danger: true,
              onTap: () => open(showFreezeSheet, 'Vault frozen'),
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.danger = false,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AFColors.surface,
      shape: RoundedRectangleBorder(
        side: const BorderSide(color: AFColors.line),
        borderRadius: BorderRadius.circular(18),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
          child: Column(
            children: [
              Icon(
                icon,
                color: danger ? AFColors.danger : AFColors.mint,
                size: 22,
              ),
              const SizedBox(height: 8),
              Text(
                label,
                style: const TextStyle(
                  color: AFColors.fg,
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CreditVaultCard extends StatelessWidget {
  const _CreditVaultCard({required this.agent, required this.mono});
  final Agent agent;
  final TextTheme mono;

  @override
  Widget build(BuildContext context) {
    final volumeUsd = agent.totalVolumeUsdc / 1000000;
    final remText = _fmtUsd(volumeUsd);
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AFColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AFColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Text(
                'Credit vault',
                style: TextStyle(
                  color: AFColors.fg,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Spacer(),
              Text(
                'on-chain',
                style: TextStyle(color: AFColors.muted, fontSize: 12),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            '\$$remText',
            style: mono.headlineMedium?.copyWith(
              color: AFColors.fg,
              fontSize: 30,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.75,
              height: 1,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'lifetime volume · ${_fmtCompact(agent.totalTransactions)} tx',
            style: const TextStyle(color: AFColors.muted, fontSize: 13),
          ),
          const SizedBox(height: 14),
          _VaultGauge(
            fraction: (agent.score / 1000).clamp(0.0, 1.0),
            scored: agent.isScored,
          ),
          const SizedBox(height: 14),
          _MiniGrid(agent: agent, mono: mono),
        ],
      ),
    );
  }
}

class _VaultGauge extends StatelessWidget {
  const _VaultGauge({required this.fraction, required this.scored});
  final double fraction;
  final bool scored;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(100),
      child: Container(
        height: 9,
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
                        BoxShadow(color: AFColors.mintGlow, blurRadius: 12),
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

class _MiniGrid extends StatelessWidget {
  const _MiniGrid({required this.agent, required this.mono});
  final Agent agent;
  final TextTheme mono;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: _MiniChip(
                label: 'TX',
                value: _fmtCompact(agent.totalTransactions),
                mono: mono,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _MiniChip(
                label: 'STREAK',
                value: _fmtCompact(agent.consecutiveSuccess),
                mono: mono,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _MiniChip(
                label: 'SERVICES',
                value: _fmtCompact(agent.servicesUsed),
                mono: mono,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _MiniChip(
                label: 'NEG. FLAGS',
                value: agent.activeNegativeFeedbackCount.toString(),
                mono: mono,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _MiniChip extends StatelessWidget {
  const _MiniChip({
    required this.label,
    required this.value,
    required this.mono,
  });
  final String label;
  final String value;
  final TextTheme mono;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AFColors.surface2,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AFColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: AFColors.muted,
              fontSize: 10.5,
              letterSpacing: 0.63,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            value,
            style: mono.titleMedium?.copyWith(
              color: AFColors.fg,
              fontSize: 17,
              fontWeight: FontWeight.w500,
              height: 1,
            ),
          ),
        ],
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

String _tier(int score) {
  if (score >= 800) return 'ELITE';
  if (score >= 600) return 'TRUSTED';
  if (score >= 400) return 'FAIR';
  if (score > 0) return 'NEW';
  return 'UNSCORED';
}

String _label(Agent a) {
  if (a.servicesUsed == 0) return 'Agent · idle';
  return 'Agent · ${_fmtCompact(a.servicesUsed)} services';
}
