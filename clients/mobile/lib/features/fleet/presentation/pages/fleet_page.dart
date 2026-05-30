import 'dart:ui' show ImageFilter;

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:get_it/get_it.dart';

import '../../../../app/router.dart';
import '../../../../app/theme.dart';
import '../../../agents/presentation/add_agent_sheet.dart';
import '../../../alerts/data/repositories/alerts_repository.dart';
import '../../../wallet/data/repositories/wallet_repository.dart';
import '../activity/activity_feed.dart';
import '../activity/activity_screen.dart';
import '../alerts/alerts_screen.dart';
import '../bloc/fleet_bloc.dart';
import '../bloc/fleet_event.dart';
import '../bloc/fleet_state.dart';
import '../widgets/agent_card.dart';
import '../widgets/sparkline.dart';
import 'agent_detail_page.dart';

enum _HomeTab { fleet, activity, alerts }

@RoutePage()
class FleetPage extends StatelessWidget {
  const FleetPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => GetIt.I<FleetBloc>(),
      child: const _FleetView(),
    );
  }
}

class _FleetView extends StatefulWidget {
  const _FleetView();

  @override
  State<_FleetView> createState() => _FleetViewState();
}

class _FleetViewState extends State<_FleetView> {
  _HomeTab _tab = _HomeTab.fleet;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final cached = await GetIt.I<WalletRepository>().cachedConnection();
    if (!mounted) return;
    context
        .read<FleetBloc>()
        .add(FleetLoadRequested(ownerPubkey: cached?.pubkeyBase58));
    if (cached != null) {
      final alerts = GetIt.I<AlertsRepository>();
      alerts.watch(cached.pubkeyBase58);
      alerts.refresh(silent: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AFColors.bg,
      extendBody: true,
      body: SafeArea(
        bottom: false,
        child: Stack(
          children: [
            BlocListener<FleetBloc, FleetState>(
              listener: (_, state) {
                if (state is FleetLoaded) {
                  ActivityFeed.instance.ingestSnapshot(state.agents);
                }
              },
              child: _tabBody(),
            ),
            Positioned(
              left: 14,
              right: 14,
              bottom: 14,
              child: ListenableBuilder(
                listenable: GetIt.I<AlertsRepository>(),
                builder: (_, __) => _FloatingTabBar(
                  current: _tab,
                  unreadCount: GetIt.I<AlertsRepository>().unreadCount,
                  onChanged: (t) => setState(() => _tab = t),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _tabBody() {
    switch (_tab) {
      case _HomeTab.fleet:
        return _FleetTab(onBootstrap: _bootstrap);
      case _HomeTab.activity:
        return const _ActivityTab();
      case _HomeTab.alerts:
        return const _AlertsTab();
    }
  }
}

class _FleetTab extends StatelessWidget {
  const _FleetTab({required this.onBootstrap});
  final Future<void> Function() onBootstrap;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<FleetBloc, FleetState>(
      builder: (context, state) {
        if (state is FleetInitial || state is FleetLoading) {
          return const Center(
            child: CircularProgressIndicator(color: AFColors.mint),
          );
        }
        if (state is FleetWalletRequired) return const _WalletGate();
        if (state is FleetError) {
          return _ErrorView(
            message: state.message,
            onRetry: onBootstrap,
          );
        }
        if (state is FleetEmpty) {
          return _Body(
            ownerPubkey: state.ownerPubkey,
            child: const _EmptyView(),
          );
        }
        if (state is FleetLoaded) {
          return _Body(
            ownerPubkey: state.ownerPubkey,
            child: _LoadedView(state: state, onRefresh: onBootstrap),
          );
        }
        return const SizedBox.shrink();
      },
    );
  }
}

class _ActivityTab extends StatelessWidget {
  const _ActivityTab();

  @override
  Widget build(BuildContext context) {
    return const ActivityScreen();
  }
}

class _AlertsTab extends StatelessWidget {
  const _AlertsTab();

  @override
  Widget build(BuildContext context) {
    return const AlertsScreen();
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.ownerPubkey, required this.child});
  final String? ownerPubkey;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _FleetHeader(ownerPubkey: ownerPubkey),
        Expanded(child: child),
      ],
    );
  }
}

class _FleetHeader extends StatelessWidget {
  const _FleetHeader({required this.ownerPubkey});
  final String? ownerPubkey;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 14),
      child: Row(
        children: [
          _CircleHeaderButton(
            icon: _fleetIconPath,
            onTap: () {},
          ),
          Expanded(
            child: Center(
              child: ownerPubkey == null
                  ? const SizedBox.shrink()
                  : _WalletKeyButton(ownerPubkey: ownerPubkey!),
            ),
          ),
          _CircleHeaderButton(
            icon: _bellIconPath,
            onTap: () {},
            badge: true,
          ),
        ],
      ),
    );
  }
}

class _CircleHeaderButton extends StatelessWidget {
  const _CircleHeaderButton({
    required this.icon,
    required this.onTap,
    this.badge = false,
  });
  final IconData icon;
  final VoidCallback onTap;
  final bool badge;

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Material(
          color: AFColors.surface2,
          shape: const CircleBorder(side: BorderSide(color: AFColors.line)),
          child: InkWell(
            onTap: onTap,
            customBorder: const CircleBorder(),
            child: SizedBox(
              width: 44,
              height: 44,
              child: Icon(icon, color: AFColors.fg, size: 19),
            ),
          ),
        ),
        if (badge)
          Positioned(
            right: 4,
            top: 4,
            child: Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: AFColors.danger,
                shape: BoxShape.circle,
                border: Border.all(color: AFColors.bg, width: 1.5),
              ),
            ),
          ),
      ],
    );
  }
}

class _WalletKeyButton extends StatelessWidget {
  const _WalletKeyButton({required this.ownerPubkey});
  final String ownerPubkey;

  @override
  Widget build(BuildContext context) {
    final mono = Theme.of(context).extension<AFTypography>()!.mono;
    final initials = ownerPubkey.length >= 2
        ? ownerPubkey.substring(0, 2).toUpperCase()
        : ownerPubkey.toUpperCase();
    return Material(
      color: AFColors.surface2,
      shape: const StadiumBorder(side: BorderSide(color: AFColors.line)),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: () {},
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 0),
          child: SizedBox(
            height: 44,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 26,
                  height: 26,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [AFColors.mint, AFColors.mintDark],
                    ),
                  ),
                  child: Text(
                    initials,
                    style: const TextStyle(
                      color: Color(0xFF08090B),
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(width: 9),
                Padding(
                  padding: const EdgeInsets.only(right: 7),
                  child: Text(
                    _shortPubkey(ownerPubkey, 4),
                    style: mono.bodyMedium?.copyWith(
                      color: AFColors.fg,
                      fontWeight: FontWeight.w500,
                      fontSize: 15,
                      letterSpacing: -0.15,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _LoadedView extends StatelessWidget {
  const _LoadedView({required this.state, required this.onRefresh});
  final FleetLoaded state;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final mono = Theme.of(context).extension<AFTypography>()!.mono;
    return RefreshIndicator(
      color: AFColors.mint,
      backgroundColor: AFColors.surface,
      onRefresh: onRefresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(bottom: 110),
        children: [
          _BalanceHero(state: state, mono: mono),
          _ListLabelRow(count: state.agents.length, mono: mono),
          for (final agent in state.agents) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => AgentDetailPage(
                        agent: agent,
                        scoreDelta: state.scoreDeltas[agent.pubkey],
                      ),
                    ),
                  ),
                  borderRadius: BorderRadius.circular(18),
                  child: AgentCardView(
                    agent: agent,
                    scoreDelta: state.scoreDeltas[agent.pubkey],
                  ),
                ),
              ),
            ),
          ],
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

class _BalanceHero extends StatelessWidget {
  const _BalanceHero({required this.state, required this.mono});
  final FleetLoaded state;
  final TextTheme mono;

  @override
  Widget build(BuildContext context) {
    final tvl = state.tvlUsdcMicro / 1000000;
    final tvlText = _fmtUsd(tvl);
    final delta = state.tvlDeltaPct;
    final txTotal =
        state.agents.fold<int>(0, (s, a) => s + a.totalTransactions);
    final values = state.tvlHistory
        .map((s) => s.tvlUsdcMicro.toDouble())
        .toList(growable: false);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'FLEET VAULT TVL',
            style: TextStyle(
              color: AFColors.muted,
              fontSize: 12,
              letterSpacing: 1.0,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 4),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Text(
                  '\$$tvlText',
                  style: const TextStyle(
                    color: AFColors.fg,
                    fontSize: 48,
                    fontWeight: FontWeight.w600,
                    letterSpacing: -1.92,
                    height: 1.0,
                  ),
                ),
              ),
              const _LiveBadge(),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              if (delta != null) _DeltaPill(delta: delta, mono: mono),
              if (delta != null) const SizedBox(width: 10),
              Flexible(
                child: Text(
                  delta != null
                      ? 'of \$$tvlText deposited'
                      : 'across ${state.agents.length} '
                          '${state.agents.length == 1 ? 'agent' : 'agents'} · live',
                  style: const TextStyle(
                    color: AFColors.muted,
                    fontSize: 13.5,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (values.length > 1)
            Sparkline(values: values, height: 46)
          else
            const SizedBox(height: 46),
          const SizedBox(height: 6),
          _BalanceStats(
            txTotal: txTotal,
            avgRep: state.avgScore,
            activeCount: state.activeCount,
            totalCount: state.agents.length,
            mono: mono,
          ),
        ],
      ),
    );
  }
}

class _LiveBadge extends StatelessWidget {
  const _LiveBadge();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: const BoxDecoration(
              color: AFColors.mint,
              shape: BoxShape.circle,
              boxShadow: [BoxShadow(color: AFColors.mintGlow, blurRadius: 10)],
            ),
          ),
          const SizedBox(width: 6),
          const Text(
            'LIVE',
            style: TextStyle(
              color: AFColors.mint,
              fontSize: 12,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.96,
            ),
          ),
        ],
      ),
    );
  }
}

class _DeltaPill extends StatelessWidget {
  const _DeltaPill({required this.delta, required this.mono});
  final double delta;
  final TextTheme mono;

  @override
  Widget build(BuildContext context) {
    final up = delta >= 0;
    final color = up ? AFColors.mint : AFColors.danger;
    final bg = up ? AFColors.mintTint : AFColors.dangerSoft;
    final pct = (delta.abs() * 100).toStringAsFixed(1);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(100),
      ),
      child: Text(
        '${up ? '▲' : '▼'} $pct%',
        style: TextStyle(
          color: color,
          fontSize: 12.5,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}

class _BalanceStats extends StatelessWidget {
  const _BalanceStats({
    required this.txTotal,
    required this.avgRep,
    required this.activeCount,
    required this.totalCount,
    required this.mono,
  });
  final int txTotal;
  final double avgRep;
  final int activeCount;
  final int totalCount;
  final TextTheme mono;

  @override
  Widget build(BuildContext context) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _StatCol(
            label: '24H SPEND',
            value: '\$0.00',
            sub: '· ${_fmtCompact(txTotal)} tx',
            mono: mono,
          ),
          _StatDivider(),
          _StatCol(
            label: 'AVG. REP',
            value: avgRep == 0 ? '—' : avgRep.toStringAsFixed(0),
            mono: mono,
          ),
          _StatDivider(),
          _StatCol(
            label: 'ACTIVE',
            value: activeCount.toString(),
            sub: ' / $totalCount',
            mono: mono,
          ),
        ],
      ),
    );
  }
}

class _StatDivider extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Container(
        width: 1,
        margin: const EdgeInsets.symmetric(horizontal: 16),
        color: AFColors.line,
      );
}

class _StatCol extends StatelessWidget {
  const _StatCol({
    required this.label,
    required this.value,
    this.sub,
    required this.mono,
  });
  final String label;
  final String value;
  final String? sub;
  final TextTheme mono;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: AFColors.muted,
              fontSize: 11,
              letterSpacing: 0.55,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 4),
          RichText(
            text: TextSpan(
              text: value,
              style: mono.titleMedium?.copyWith(
                color: AFColors.fg,
                fontSize: 18,
                fontWeight: FontWeight.w500,
                letterSpacing: -0.36,
                height: 1,
              ),
              children: sub == null
                  ? null
                  : [
                      TextSpan(
                        text: ' $sub',
                        style: const TextStyle(
                          color: AFColors.muted,
                          fontSize: 11,
                          fontWeight: FontWeight.w400,
                        ),
                      ),
                    ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ListLabelRow extends StatelessWidget {
  const _ListLabelRow({required this.count, required this.mono});
  final int count;
  final TextTheme mono;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 22, 20, 12),
      child: Row(
        children: [
          Container(
            height: 38,
            padding: const EdgeInsets.fromLTRB(12, 0, 16, 0),
            decoration: BoxDecoration(
              color: AFColors.surface2,
              borderRadius: BorderRadius.circular(100),
              border: Border.all(color: AFColors.line),
            ),
            child: const Row(
              children: [
                Icon(_fleetIconPath, color: AFColors.mint, size: 18),
                SizedBox(width: 9),
                Text(
                  'Agents',
                  style: TextStyle(
                    color: AFColors.fg,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          const Spacer(),
          Text(
            '$count',
            style: const TextStyle(
              color: AFColors.muted,
              fontSize: 13.5,
            ),
          ),
          const SizedBox(width: 10),
          _AddAgentButton(),
        ],
      ),
    );
  }
}

class _AddAgentButton extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Material(
      color: AFColors.mintTint,
      shape: const StadiumBorder(
        side: BorderSide(color: AFColors.mintDim),
      ),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: () async {
          final ok = await showAddAgentSheet(context);
          if (ok == true && context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                backgroundColor: AFColors.surface2,
                content: Text(
                  'Agent provisioned',
                  style: TextStyle(color: AFColors.fg),
                ),
              ),
            );
          }
        },
        child: const Padding(
          padding: EdgeInsets.fromLTRB(11, 0, 14, 0),
          child: SizedBox(
            height: 38,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.add, color: AFColors.mint, size: 17),
                SizedBox(width: 5),
                Text(
                  'Add',
                  style: TextStyle(
                    color: AFColors.mint,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.2,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _FloatingTabBar extends StatelessWidget {
  const _FloatingTabBar({
    required this.current,
    required this.onChanged,
    this.unreadCount = 0,
  });
  final _HomeTab current;
  final ValueChanged<_HomeTab> onChanged;
  final int unreadCount;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(26),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 28, sigmaY: 28),
        child: Container(
          height: 62,
          padding: const EdgeInsets.all(7),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(26),
            border: Border.all(color: const Color(0x1FFFFFFF)),
            gradient: const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0x8C1E2125), Color(0xB30E0F11)],
            ),
            boxShadow: const [
              BoxShadow(
                color: Color(0x80000000),
                blurRadius: 40,
                offset: Offset(0, 16),
              ),
            ],
          ),
          child: Row(
            children: [
              _TabItem(
                icon: _fleetIconPath,
                label: 'Fleet',
                selected: current == _HomeTab.fleet,
                onTap: () => onChanged(_HomeTab.fleet),
              ),
              _TabItem(
                icon: _activityIconPath,
                label: 'Activity',
                selected: current == _HomeTab.activity,
                onTap: () => onChanged(_HomeTab.activity),
              ),
              _TabItem(
                icon: _bellIconPath,
                label: 'Alerts',
                selected: current == _HomeTab.alerts,
                onTap: () => onChanged(_HomeTab.alerts),
                badge: unreadCount > 0,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TabItem extends StatelessWidget {
  const _TabItem({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
    this.badge = false,
  });
  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final bool badge;

  @override
  Widget build(BuildContext context) {
    final color = selected ? AFColors.mint : AFColors.muted;
    final tile = Container(
      decoration: selected
          ? BoxDecoration(
              borderRadius: BorderRadius.circular(19),
              gradient: const LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0x29D9F0E8), Color(0x0FD9F0E8)],
              ),
              border: Border.all(color: const Color(0x2ED9F0E8)),
            )
          : null,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              Icon(icon, color: color, size: 23),
              if (badge)
                Positioned(
                  right: -3,
                  top: -2,
                  child: Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: AFColors.danger,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: const Color(0xFF14161A),
                        width: 1.5,
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 3),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 10.5,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 3),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(19),
            child: tile,
          ),
        ),
      ),
    );
  }
}

class _WalletGate extends StatelessWidget {
  const _WalletGate();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.account_balance_wallet_outlined,
                color: AFColors.muted, size: 40),
            const SizedBox(height: 14),
            const Text(
              'Sign in with your wallet',
              style: TextStyle(
                color: AFColors.fg,
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Agent Fuel scopes every fleet view to the connected owner. '
              'Reconnect your wallet from onboarding to view your fleet.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AFColors.muted, height: 1.5),
            ),
            const SizedBox(height: 18),
            FilledButton(
              onPressed: () =>
                  context.router.replaceAll([const OnboardingRoute()]),
              child: const Text('Back to onboarding'),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyView extends StatelessWidget {
  const _EmptyView();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.bolt_outlined, color: AFColors.mint, size: 40),
            const SizedBox(height: 14),
            const Text(
              'No agents yet',
              style: TextStyle(
                color: AFColors.fg,
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Your fleet is empty. Spin up your first agent to start tracking '
              'spend, reputation, and policy events in real time.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AFColors.muted, height: 1.5),
            ),
            const SizedBox(height: 22),
            FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: AFColors.mint,
                foregroundColor: const Color(0xFF08090B),
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
              ),
              onPressed: () => showAddAgentSheet(context),
              icon: const Icon(Icons.add, size: 18),
              label: const Text(
                'Add agent',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AFColors.danger)),
            const SizedBox(height: 16),
            FilledButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}

const IconData _fleetIconPath = Icons.dashboard_outlined;
const IconData _bellIconPath = Icons.notifications_none_rounded;
const IconData _activityIconPath = Icons.show_chart;

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
