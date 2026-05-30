import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show HapticFeedback, TextInputFormatter, TextEditingValue;
import 'package:get_it/get_it.dart';

import '../../../app/theme.dart';
import '../../../core/error/exceptions.dart';
import '../../../core/ui/onchain_error_card.dart';
import '../../auth/data/datasources/biometric_service.dart';
import '../../onboarding/domain/entities/onboarding_flow.dart';
import '../../wallet/data/repositories/wallet_repository.dart';
import '../domain/usecases/provision_agent.dart';

/// Single-screen task sheet for adding a new agent. Mirrors the onboarding
/// fields (handle, deposit, policy preset) but lives outside the wizard so
/// the framing reads as a task, not as a first-run orientation flow.
Future<bool?> showAddAgentSheet(BuildContext context) {
  return showModalBottomSheet<bool>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    barrierColor: const Color(0x99000000),
    builder: (_) => const _AddAgentSheetScaffold(),
  );
}

class _AddAgentSheetScaffold extends StatelessWidget {
  const _AddAgentSheetScaffold();

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
          child: const _AddAgentBody(),
        ),
      ),
    );
  }
}

class _AddAgentBody extends StatefulWidget {
  const _AddAgentBody();

  @override
  State<_AddAgentBody> createState() => _AddAgentBodyState();
}

class _AddAgentBodyState extends State<_AddAgentBody> {
  final _handleCtrl = TextEditingController();
  // Pre-fill Custom inputs from Balanced so jumping to Custom isn't
  // start-from-zero. Edited values survive switching presets and back.
  final _customPerTxCtrl = TextEditingController(
    text: PolicyPreset.presets[RiskProfile.balanced]!.maxPerTxUsdc.toString(),
  );
  final _customPerHourCtrl = TextEditingController(
    text: PolicyPreset.presets[RiskProfile.balanced]!.maxPerHourUsdc.toString(),
  );
  int _deposit = 0;
  RiskProfile _risk = RiskProfile.balanced;
  bool _busy = false;
  OnchainErrorState? _error;

  // 0 first so the friction floor for a new agent is "create it now, fund
  // it later from the agent detail sheet." Most devnet wallets don't have
  // USDC on hand; defaulting to a non-zero deposit guarantees an
  // insufficient-funds revert on the first tap.
  static const _depositPresets = [0, 10, 50, 100, 500];

  @override
  void dispose() {
    _handleCtrl.dispose();
    _customPerTxCtrl.dispose();
    _customPerHourCtrl.dispose();
    super.dispose();
  }

  double? get _customPerTx => double.tryParse(_customPerTxCtrl.text.trim());
  double? get _customPerHour => double.tryParse(_customPerHourCtrl.text.trim());

  bool get _customValid =>
      _risk != RiskProfile.custom ||
      ((_customPerTx ?? 0) > 0 && (_customPerHour ?? 0) > 0);

  bool get _valid =>
      RegExp(r'^[a-z0-9-]{2,32}$').hasMatch(_handleCtrl.text.trim()) &&
      _deposit >= 0 &&
      _customValid;

  double get _effectivePerTx => _risk == RiskProfile.custom
      ? (_customPerTx ?? 0)
      : PolicyPreset.presets[_risk]!.maxPerTxUsdc.toDouble();

  double get _effectivePerHour => _risk == RiskProfile.custom
      ? (_customPerHour ?? 0)
      : PolicyPreset.presets[_risk]!.maxPerHourUsdc.toDouble();

  Future<void> _submit() async {
    if (!_valid || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final wallet = await GetIt.I<WalletRepository>().cachedConnection();
      if (wallet == null) {
        throw WalletException(
          'Wallet session lost. Reconnect from onboarding.',
          kind: WalletExceptionKind.userCancelled,
        );
      }
      final ok = await GetIt.I<BiometricService>().authorize(
        'Authorize Agent Fuel to fund and configure your agent',
      );
      if (!ok) {
        if (!mounted) return;
        setState(() {
          _busy = false;
          _error = const OnchainErrorState('Biometric cancelled. Tap again to retry.');
        });
        return;
      }
      HapticFeedback.mediumImpact();
      await GetIt.I<ProvisionAgentUseCase>()(
        ownerPubkeyBase58: wallet.pubkeyBase58,
        walletAuthToken: wallet.authToken,
        handle: _handleCtrl.text.trim(),
        depositUsdc: _deposit,
        perTxLimitUsdc: _effectivePerTx,
        hourlyLimitUsdc: _effectivePerHour,
        allowPostPay: false,
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on OnchainSimulationException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = OnchainErrorState(e.message, e.logs);
      });
    } on WalletException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = OnchainErrorState(e.message);
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = OnchainErrorState('Provisioning failed: $e');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final mono = Theme.of(context).extension<AFTypography>()!.mono;
    return SafeArea(
      top: false,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _Handle(),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
            child: Row(
              children: [
                const Expanded(
                  child: Text(
                    'Add new agent',
                    style: TextStyle(
                      color: AFColors.fg,
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      letterSpacing: -0.36,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: _busy ? null : () => Navigator.of(context).pop(false),
                  icon: const Icon(Icons.close, color: AFColors.muted),
                  splashRadius: 18,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
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
                  const _Label('Handle'),
                  const SizedBox(height: 8),
                  _HandleField(
                    controller: _handleCtrl,
                    enabled: !_busy,
                    onChanged: () => setState(() {
                      if (_error != null) _error = null;
                    }),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'lowercase, digits, hyphens — 2 to 32 chars',
                    style: TextStyle(color: AFColors.muted2, fontSize: 11.5),
                  ),
                  const SizedBox(height: 22),
                  const _Label('Initial deposit (optional)'),
                  const SizedBox(height: 8),
                  _DepositRow(
                    deposit: _deposit,
                    enabled: !_busy,
                    onChanged: (v) => setState(() => _deposit = v),
                    mono: mono,
                  ),
                  const SizedBox(height: 22),
                  const _Label('Risk profile'),
                  const SizedBox(height: 8),
                  _RiskColumn(
                    selected: _risk,
                    enabled: !_busy,
                    onChanged: (r) => setState(() => _risk = r),
                    mono: mono,
                  ),
                  if (_risk == RiskProfile.custom) ...[
                    const SizedBox(height: 12),
                    _CustomLimitsRow(
                      perTxCtrl: _customPerTxCtrl,
                      perHourCtrl: _customPerHourCtrl,
                      enabled: !_busy,
                      onChanged: () => setState(() {
                        if (_error != null) _error = null;
                      }),
                      mono: mono,
                    ),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 16),
                    OnchainErrorCard(error: _error!),
                  ],
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
            child: _AuthorizeButton(
              busy: _busy,
              enabled: _valid,
              onTap: _submit,
            ),
          ),
        ],
      ),
    );
  }
}

class _Handle extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
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
}

class _Label extends StatelessWidget {
  const _Label(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Text(
        text.toUpperCase(),
        style: const TextStyle(
          color: AFColors.muted,
          fontSize: 10.5,
          letterSpacing: 0.84,
          fontWeight: FontWeight.w600,
        ),
      );
}

class _HandleField extends StatelessWidget {
  const _HandleField({
    required this.controller,
    required this.enabled,
    required this.onChanged,
  });
  final TextEditingController controller;
  final bool enabled;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      enabled: enabled,
      autocorrect: false,
      enableSuggestions: false,
      cursorColor: AFColors.mint,
      inputFormatters: [_HandleFormatter()],
      style: const TextStyle(
        color: AFColors.fg,
        fontSize: 16,
        fontWeight: FontWeight.w500,
      ),
      onChanged: (_) => onChanged(),
      decoration: InputDecoration(
        isDense: true,
        filled: true,
        fillColor: AFColors.surface2,
        hintText: 'cortex-1',
        hintStyle: const TextStyle(color: AFColors.muted2),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AFColors.line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AFColors.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AFColors.mintDim),
        ),
      ),
    );
  }
}

class _HandleFormatter extends TextInputFormatter {
  static final _allowed = RegExp(r'^[a-z0-9-]{0,32}$');
  @override
  TextEditingValue formatEditUpdate(TextEditingValue old, TextEditingValue next) {
    final lowered = next.text.toLowerCase();
    if (_allowed.hasMatch(lowered)) {
      return next.copyWith(
        text: lowered,
        selection: TextSelection.collapsed(offset: lowered.length),
      );
    }
    return old;
  }
}

class _DepositRow extends StatelessWidget {
  const _DepositRow({
    required this.deposit,
    required this.enabled,
    required this.onChanged,
    required this.mono,
  });
  final int deposit;
  final bool enabled;
  final ValueChanged<int> onChanged;
  final TextTheme mono;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final v in _AddAgentBodyState._depositPresets)
          _DepositChip(
            value: v,
            selected: deposit == v,
            enabled: enabled,
            onTap: () => onChanged(v),
            mono: mono,
          ),
      ],
    );
  }
}

class _DepositChip extends StatelessWidget {
  const _DepositChip({
    required this.value,
    required this.selected,
    required this.enabled,
    required this.onTap,
    required this.mono,
  });
  final int value;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;
  final TextTheme mono;

  @override
  Widget build(BuildContext context) {
    final color = selected ? AFColors.mint : AFColors.fg2;
    final label = value == 0 ? 'Skip' : '\$$value';
    return Material(
      color: selected ? AFColors.mintTint : AFColors.surface2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: selected ? AFColors.mintDim : AFColors.line),
      ),
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
          child: Text(
            label,
            style: mono.bodyMedium?.copyWith(
              color: color,
              fontWeight: FontWeight.w600,
              fontSize: 14,
            ),
          ),
        ),
      ),
    );
  }
}

class _RiskColumn extends StatelessWidget {
  const _RiskColumn({
    required this.selected,
    required this.enabled,
    required this.onChanged,
    required this.mono,
  });
  final RiskProfile selected;
  final bool enabled;
  final ValueChanged<RiskProfile> onChanged;
  final TextTheme mono;

  @override
  Widget build(BuildContext context) {
    const ordered = [
      RiskProfile.conservative,
      RiskProfile.balanced,
      RiskProfile.highThroughput,
      RiskProfile.custom,
    ];
    return Column(
      children: [
        for (final r in ordered) ...[
          _RiskTile(
            profile: r,
            selected: selected == r,
            enabled: enabled,
            onTap: () => onChanged(r),
            mono: mono,
          ),
          if (r != ordered.last) const SizedBox(height: 8),
        ],
      ],
    );
  }
}

class _RiskTile extends StatelessWidget {
  const _RiskTile({
    required this.profile,
    required this.selected,
    required this.enabled,
    required this.onTap,
    required this.mono,
  });
  final RiskProfile profile;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;
  final TextTheme mono;

  @override
  Widget build(BuildContext context) {
    final preset = PolicyPreset.presets[profile]!;
    return Material(
      color: selected ? AFColors.mintTint : AFColors.surface2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: selected ? AFColors.mintDim : AFColors.line),
      ),
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: 16,
                height: 16,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: selected ? AFColors.mint : AFColors.line2,
                    width: 1.5,
                  ),
                  color: selected ? AFColors.mint : Colors.transparent,
                ),
                child: selected
                    ? const Icon(Icons.check, color: Color(0xFF08090B), size: 11)
                    : null,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      preset.title,
                      style: const TextStyle(
                        color: AFColors.fg,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      profile == RiskProfile.custom
                          ? 'Set your own per-tx and hourly limits'
                          : '\$${preset.maxPerTxUsdc}/tx  ·  \$${preset.maxPerHourUsdc}/hr',
                      style: mono.bodySmall?.copyWith(
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
      ),
    );
  }
}

class _CustomLimitsRow extends StatelessWidget {
  const _CustomLimitsRow({
    required this.perTxCtrl,
    required this.perHourCtrl,
    required this.enabled,
    required this.onChanged,
    required this.mono,
  });
  final TextEditingController perTxCtrl;
  final TextEditingController perHourCtrl;
  final bool enabled;
  final VoidCallback onChanged;
  final TextTheme mono;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _LimitField(
            label: 'PER-TX',
            controller: perTxCtrl,
            enabled: enabled,
            onChanged: onChanged,
            mono: mono,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _LimitField(
            label: 'PER-HOUR',
            controller: perHourCtrl,
            enabled: enabled,
            onChanged: onChanged,
            mono: mono,
          ),
        ),
      ],
    );
  }
}

class _LimitField extends StatelessWidget {
  const _LimitField({
    required this.label,
    required this.controller,
    required this.enabled,
    required this.onChanged,
    required this.mono,
  });
  final String label;
  final TextEditingController controller;
  final bool enabled;
  final VoidCallback onChanged;
  final TextTheme mono;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      decoration: BoxDecoration(
        color: AFColors.surface2,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AFColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: AFColors.muted,
              fontSize: 9.5,
              letterSpacing: 0.8,
              fontWeight: FontWeight.w600,
            ),
          ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                '\$',
                style: mono.bodyMedium?.copyWith(
                  color: AFColors.muted,
                  fontSize: 16,
                ),
              ),
              const SizedBox(width: 2),
              Expanded(
                child: TextField(
                  controller: controller,
                  enabled: enabled,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  inputFormatters: [_DecimalFormatter()],
                  cursorColor: AFColors.mint,
                  onChanged: (_) => onChanged(),
                  style: mono.titleMedium?.copyWith(
                    color: AFColors.fg,
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                  ),
                  decoration: const InputDecoration(
                    isCollapsed: true,
                    border: InputBorder.none,
                    contentPadding: EdgeInsets.symmetric(vertical: 6),
                    hintText: '0',
                    hintStyle: TextStyle(color: AFColors.muted2),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DecimalFormatter extends TextInputFormatter {
  static final _re = RegExp(r'^\d{0,7}(\.\d{0,2})?$');
  @override
  TextEditingValue formatEditUpdate(TextEditingValue old, TextEditingValue next) {
    if (next.text.isEmpty) return next;
    return _re.hasMatch(next.text) ? next : old;
  }
}

class _AuthorizeButton extends StatelessWidget {
  const _AuthorizeButton({
    required this.busy,
    required this.enabled,
    required this.onTap,
  });
  final bool busy;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final disabled = busy || !enabled;
    return SizedBox(
      height: 52,
      child: Material(
        color: disabled
            ? AFColors.mint.withValues(alpha: 0.35)
            : AFColors.mint,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: disabled ? null : onTap,
          borderRadius: BorderRadius.circular(16),
          child: Center(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  busy ? Icons.hourglass_empty : Icons.fingerprint,
                  color: const Color(0xFF08090B),
                  size: 18,
                ),
                const SizedBox(width: 8),
                Text(
                  busy
                      ? 'Provisioning…'
                      : 'Authorize',
                  style: const TextStyle(
                    color: Color(0xFF08090B),
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
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
