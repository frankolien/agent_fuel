import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:get_it/get_it.dart';

import '../../../../app/theme.dart';
import '../bloc/fleet_bloc.dart';
import '../bloc/fleet_event.dart';
import '../bloc/fleet_state.dart';
import '../widgets/agent_card.dart';

@RoutePage()
class FleetPage extends StatelessWidget {
  const FleetPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => GetIt.I<FleetBloc>()..add(const FleetLoadRequested()),
      child: const _FleetView(),
    );
  }
}

class _FleetView extends StatelessWidget {
  const _FleetView();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Fleet'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () =>
                context.read<FleetBloc>().add(const FleetLoadRequested()),
          ),
        ],
      ),
      body: BlocBuilder<FleetBloc, FleetState>(
        builder: (context, state) {
          if (state is FleetInitial || state is FleetLoading) {
            return const Center(child: CircularProgressIndicator());
          }
          if (state is FleetWalletRequired) {
            return const _WalletGate();
          }

          if (state is FleetError) {
            return _ErrorView(
              message: state.message,
              onRetry: () =>
                  context.read<FleetBloc>().add(const FleetLoadRequested()),
            );
          }
          if (state is FleetEmpty) {
            return const _EmptyView();
          }
          if (state is FleetLoaded) {
            return RefreshIndicator(
              color: AFColors.mint,
              onRefresh: () async {
                context.read<FleetBloc>().add(const FleetLoadRequested());
              },
              child: ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: state.agents.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (_, i) => AgentCardView(agent: state.agents[i]),
              ),
            );
          }
          return const SizedBox.shrink();
        },
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
              onPressed: () => Navigator.of(context).maybePop(),
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
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(32),
        child: Text(
          'No agents yet.\nInitialize one from the Console to get started.',
          textAlign: TextAlign.center,
          style: TextStyle(color: AFColors.muted),
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
