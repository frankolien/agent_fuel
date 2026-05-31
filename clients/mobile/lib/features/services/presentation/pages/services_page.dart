import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:get_it/get_it.dart';
import 'package:intl/intl.dart';

import '../../../../app/theme.dart';
import '../../data/datasources/service_key_store.dart';
import '../../domain/entities/service.dart';
import '../../domain/entities/service_category.dart';
import '../bloc/services_bloc.dart';
import '../bloc/services_event.dart';
import '../bloc/services_state.dart';
import '../sheets/add_service_sheet.dart';

class ServicesPage extends StatefulWidget {
  const ServicesPage({super.key});

  @override
  State<ServicesPage> createState() => _ServicesPageState();
}

class _ServicesPageState extends State<ServicesPage> {
  Set<String> _mineCache = const {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ServicesBloc>().add(const ServicesLoadRequested());
      _refreshMine();
    });
  }

  Future<void> _refreshMine() async {
    final mine = await GetIt.I<ServiceKeyStore>().listServices();
    if (!mounted) return;
    setState(() => _mineCache = mine.toSet());
  }

  Future<void> _onAdd() async {
    final pubkey = await showAddServiceSheet(context);
    if (pubkey != null) _refreshMine();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Services',
                  style: TextStyle(
                    color: AFColors.fg,
                    fontSize: 22,
                    fontWeight: FontWeight.w600,
                    letterSpacing: -0.4,
                  ),
                ),
              ),
              FilledButton.icon(
                onPressed: _onAdd,
                icon: const Icon(Icons.add, size: 18),
                label: const Text('Add'),
              ),
            ],
          ),
          const SizedBox(height: 4),
          const Text(
            'Every registered service on the network. Yours are marked.',
            style: TextStyle(color: AFColors.muted, fontSize: 13),
          ),
          const SizedBox(height: 18),
          Expanded(
            child: BlocBuilder<ServicesBloc, ServicesState>(
              builder: (_, state) {
                if (state.loading && state.services.isEmpty) {
                  return const Center(
                    child: CircularProgressIndicator(color: AFColors.mint),
                  );
                }
                if (state.loadError != null && state.services.isEmpty) {
                  return _ErrorView(
                    message: state.loadError!,
                    onRetry: () => context
                        .read<ServicesBloc>()
                        .add(const ServicesLoadRequested()),
                  );
                }
                if (state.services.isEmpty) {
                  return _EmptyView(onAdd: _onAdd);
                }
                return RefreshIndicator(
                  color: AFColors.mint,
                  onRefresh: () async {
                    context
                        .read<ServicesBloc>()
                        .add(const ServicesLoadRequested());
                    await _refreshMine();
                  },
                  child: ListView.separated(
                    physics: const AlwaysScrollableScrollPhysics(),
                    itemBuilder: (_, i) {
                      final s = state.services[i];
                      return _ServiceTile(
                        service: s,
                        isMine: _mineCache.contains(s.pubkey),
                      );
                    },
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemCount: state.services.length,
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _ServiceTile extends StatelessWidget {
  const _ServiceTile({required this.service, required this.isMine});
  final Service service;
  final bool isMine;

  @override
  Widget build(BuildContext context) {
    final volume = NumberFormat.compactCurrency(symbol: r'$', decimalDigits: 2)
        .format(service.totalVolumeReceivedUsdc);
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
      decoration: BoxDecoration(
        color: AFColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isMine ? AFColors.mint : AFColors.line,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  service.name.isEmpty ? '(unnamed)' : service.name,
                  style: const TextStyle(
                    color: AFColors.fg,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              _StatusDot(active: service.active),
              const SizedBox(width: 4),
              Text(
                service.active ? 'active' : 'inactive',
                style: TextStyle(
                  color: service.active ? AFColors.mintDim : AFColors.muted,
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              _CategoryChip(category: service.category),
              if (isMine) ...[
                const SizedBox(width: 6),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AFColors.mintTint,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Text(
                    'YOURS',
                    style: TextStyle(
                      color: AFColors.mint,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.6,
                    ),
                  ),
                ),
              ],
              const Spacer(),
              Text(
                '$volume · ${service.totalAgentsServed} agents',
                style: const TextStyle(
                  color: AFColors.muted,
                  fontSize: 11,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            service.pubkey,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: AFColors.muted2,
              fontSize: 11,
              fontFamily: 'monospace',
            ),
          ),
        ],
      ),
    );
  }
}

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({required this.category});
  final ServiceCategory category;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: AFColors.surface3,
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(
          category.label.toUpperCase(),
          style: const TextStyle(
            color: AFColors.fg2,
            fontSize: 10,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.6,
          ),
        ),
      );
}

class _StatusDot extends StatelessWidget {
  const _StatusDot({required this.active});
  final bool active;
  @override
  Widget build(BuildContext context) => Container(
        width: 7,
        height: 7,
        decoration: BoxDecoration(
          color: active ? AFColors.mintSoft : AFColors.muted2,
          shape: BoxShape.circle,
        ),
      );
}

class _EmptyView extends StatelessWidget {
  const _EmptyView({required this.onAdd});
  final VoidCallback onAdd;
  @override
  Widget build(BuildContext context) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.api_outlined, size: 40, color: AFColors.muted),
            const SizedBox(height: 12),
            const Text(
              'No services registered yet',
              style: TextStyle(
                color: AFColors.fg,
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 6),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 32),
              child: Text(
                'Register a service to receive payments and accrue '
                'reputation on chain.',
                textAlign: TextAlign.center,
                style: TextStyle(color: AFColors.muted, fontSize: 13),
              ),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: onAdd,
              child: const Text('Register a service'),
            ),
          ],
        ),
      );
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, color: AFColors.danger, size: 36),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 32),
              child: Text(
                message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AFColors.muted, fontSize: 13),
              ),
            ),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      );
}
