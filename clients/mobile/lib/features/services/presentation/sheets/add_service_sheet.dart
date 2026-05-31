import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show HapticFeedback;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:get_it/get_it.dart';

import '../../../../app/theme.dart';
import '../../../auth/data/datasources/biometric_service.dart';
import '../../../wallet/data/repositories/wallet_repository.dart';
import '../../domain/entities/service_category.dart';
import '../bloc/services_bloc.dart';
import '../bloc/services_event.dart';
import '../bloc/services_state.dart';

Future<String?> showAddServiceSheet(BuildContext context) {
  return showModalBottomSheet<String>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    barrierColor: const Color(0x99000000),
    builder: (_) => BlocProvider.value(
      value: BlocProvider.of<ServicesBloc>(context),
      child: const _Scaffold(),
    ),
  );
}

class _Scaffold extends StatelessWidget {
  const _Scaffold();

  @override
  Widget build(BuildContext context) {
    final viewInsets = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: viewInsets),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.92,
        ),
        child: Container(
          decoration: const BoxDecoration(
            color: Color(0xFF0C0D0F),
            borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
            border: Border(top: BorderSide(color: AFColors.line2)),
          ),
          child: const _Body(),
        ),
      ),
    );
  }
}

class _Body extends StatefulWidget {
  const _Body();
  @override
  State<_Body> createState() => _BodyState();
}

class _BodyState extends State<_Body> {
  final _nameCtrl = TextEditingController();
  final _uriCtrl = TextEditingController();
  ServiceCategory _category = ServiceCategory.dataFeed;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _uriCtrl.dispose();
    super.dispose();
  }

  String get _name => _nameCtrl.text.trim();
  String get _uri => _uriCtrl.text.trim();

  // 32-byte name field on chain — measured in UTF-8 bytes, not chars.
  bool get _nameValid =>
      _name.isNotEmpty && _name.codeUnits.length <= 32;
  // 128-byte URI field on chain, empty allowed.
  bool get _uriValid => _uri.codeUnits.length <= 128;

  bool get _formValid => _nameValid && _uriValid;

  Future<void> _submit() async {
    final wallet = await GetIt.I<WalletRepository>().cachedConnection();
    if (!mounted) return;
    if (wallet == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Wallet session lost. Reconnect from onboarding.'),
        ),
      );
      return;
    }
    final ok = await GetIt.I<BiometricService>().authorize(
      'Authorize new service registration',
    );
    if (!ok || !mounted) return;
    HapticFeedback.mediumImpact();
    context.read<ServicesBloc>().add(ServiceRegisterRequested(
          ownerPubkeyBase58: wallet.pubkeyBase58,
          walletAuthToken: wallet.authToken,
          name: _name,
          category: _category,
          serviceUri: _uri,
        ));
  }

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<ServicesBloc, ServicesState>(
      listenWhen: (prev, next) =>
          prev.lastRegisteredPubkey != next.lastRegisteredPubkey &&
          next.lastRegisteredPubkey != null,
      listener: (_, state) {
        // Pop the sheet on success and pass the new pubkey back to the
        // caller so the page can scroll to / highlight it.
        Navigator.of(context).pop(state.lastRegisteredPubkey);
      },
      builder: (context, state) {
        final busy = state.registering;
        return SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const _GrabHandle(),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
                child: Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Register a service',
                        style: TextStyle(
                          color: AFColors.fg,
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                          letterSpacing: -0.36,
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: busy ? null : () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close, color: AFColors.muted),
                      splashRadius: 18,
                      padding: EdgeInsets.zero,
                      constraints:
                          const BoxConstraints(minWidth: 32, minHeight: 32),
                    ),
                  ],
                ),
              ),
              Flexible(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const _Label('Name (max 32 chars)'),
                      const SizedBox(height: 8),
                      _TextField(
                        controller: _nameCtrl,
                        enabled: !busy,
                        hint: 'e.g. Pyth BTC/USD',
                        maxLength: 32,
                        onChanged: () => setState(() {}),
                      ),
                      const SizedBox(height: 18),
                      const _Label('Category'),
                      const SizedBox(height: 8),
                      _CategoryColumn(
                        selected: _category,
                        enabled: !busy,
                        onChanged: (c) => setState(() => _category = c),
                      ),
                      const SizedBox(height: 18),
                      const _Label('Service URI (optional)'),
                      const SizedBox(height: 8),
                      _TextField(
                        controller: _uriCtrl,
                        enabled: !busy,
                        hint: 'https://docs.example.com/service.json',
                        maxLength: 128,
                        onChanged: () => setState(() {}),
                      ),
                      if (state.registerError != null) ...[
                        const SizedBox(height: 16),
                        _ErrorCard(message: state.registerError!),
                      ],
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                child: _SubmitButton(
                  busy: busy,
                  enabled: _formValid,
                  onTap: _submit,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Text(
        text,
        style: const TextStyle(
          color: AFColors.muted,
          fontSize: 12,
          fontWeight: FontWeight.w500,
          letterSpacing: 0.4,
        ),
      );
}

class _TextField extends StatelessWidget {
  const _TextField({
    required this.controller,
    required this.enabled,
    required this.hint,
    required this.maxLength,
    required this.onChanged,
  });
  final TextEditingController controller;
  final bool enabled;
  final String hint;
  final int maxLength;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      enabled: enabled,
      maxLength: maxLength,
      onChanged: (_) => onChanged(),
      style: const TextStyle(color: AFColors.fg, fontSize: 15),
      decoration: InputDecoration(
        hintText: hint,
        counterText: '',
        hintStyle: const TextStyle(color: AFColors.muted2),
        filled: true,
        fillColor: AFColors.surface2,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AFColors.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AFColors.mint),
        ),
      ),
    );
  }
}

class _CategoryColumn extends StatelessWidget {
  const _CategoryColumn({
    required this.selected,
    required this.enabled,
    required this.onChanged,
  });
  final ServiceCategory selected;
  final bool enabled;
  final ValueChanged<ServiceCategory> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (final c in ServiceCategory.values) ...[
          _CategoryTile(
            category: c,
            selected: c == selected,
            enabled: enabled,
            onTap: () => onChanged(c),
          ),
          if (c != ServiceCategory.values.last) const SizedBox(height: 8),
        ],
      ],
    );
  }
}

class _CategoryTile extends StatelessWidget {
  const _CategoryTile({
    required this.category,
    required this.selected,
    required this.enabled,
    required this.onTap,
  });
  final ServiceCategory category;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: enabled ? onTap : null,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: selected ? AFColors.mintTint : AFColors.surface2,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? AFColors.mint : AFColors.line,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 18,
              height: 18,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: selected ? AFColors.mint : AFColors.line2,
                  width: 2,
                ),
                color: selected ? AFColors.mint : Colors.transparent,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    category.label,
                    style: const TextStyle(
                      color: AFColors.fg,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    category.hint,
                    style: const TextStyle(
                      color: AFColors.muted,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SubmitButton extends StatelessWidget {
  const _SubmitButton({
    required this.busy,
    required this.enabled,
    required this.onTap,
  });
  final bool busy;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 52,
      child: FilledButton(
        onPressed: (busy || !enabled) ? null : onTap,
        child: busy
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: AFColors.bg,
                ),
              )
            : const Text('Register service'),
      ),
    );
  }
}

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.message});
  final String message;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AFColors.dangerSoft,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AFColors.danger),
        ),
        child: Text(
          message,
          style: const TextStyle(
            color: AFColors.danger,
            fontSize: 13,
            height: 1.4,
          ),
        ),
      );
}

class _GrabHandle extends StatelessWidget {
  const _GrabHandle();
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 12, bottom: 14),
        child: Center(
          child: Container(
            width: 38,
            height: 5,
            decoration: BoxDecoration(
              color: const Color(0x2EFFFFFF),
              borderRadius: BorderRadius.circular(100),
            ),
          ),
        ),
      );
}
