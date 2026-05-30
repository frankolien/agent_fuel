import 'package:flutter/material.dart';
import 'package:flutter/services.dart'
    show HapticFeedback, TextEditingValue, TextInputFormatter;
import 'package:get_it/get_it.dart';

import '../../../../app/theme.dart';
import '../../../../core/error/exceptions.dart';
import '../../../../core/onchain/tx_preflight.dart';
import '../../../../core/ui/onchain_error_card.dart';
import '../../../auth/data/datasources/biometric_service.dart';
import '../../../onboarding/domain/entities/onboarding_flow.dart';
import '../../../wallet/data/repositories/wallet_repository.dart';
import '../../data/onchain/vault_action_service.dart';
import '../../domain/entities/agent.dart';

Future<bool?> showEditPolicySheet(BuildContext context, Agent agent) {
  return showModalBottomSheet<bool>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    barrierColor: const Color(0x99000000),
    builder: (_) => _EditPolicySheetScaffold(agent: agent),
  );
}

class _EditPolicySheetScaffold extends StatelessWidget {
  const _EditPolicySheetScaffold({required this.agent});
  final Agent agent;

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
          child: _EditPolicyBody(agent: agent),
        ),
      ),
    );
  }
}

class _EditPolicyBody extends StatefulWidget {
  const _EditPolicyBody({required this.agent});
  final Agent agent;

  @override
  State<_EditPolicyBody> createState() => _EditPolicyBodyState();
}

class _EditPolicyBodyState extends State<_EditPolicyBody> {
  final _perTxCtrl = TextEditingController();
  final _perHourCtrl = TextEditingController();
  final _lifetimeCtrl = TextEditingController(text: '0');
  RiskProfile _risk = RiskProfile.balanced;
  bool _allowPostPay = false;
  bool _busy = false;
  OnchainErrorState? _error;

  @override
  void initState() {
    super.initState();
    final balanced = PolicyPreset.presets[RiskProfile.balanced]!;
    _perTxCtrl.text = balanced.maxPerTxUsdc.toString();
    _perHourCtrl.text = balanced.maxPerHourUsdc.toString();
  }

  @override
  void dispose() {
    _perTxCtrl.dispose();
    _perHourCtrl.dispose();
    _lifetimeCtrl.dispose();
    super.dispose();
  }

  double? get _perTx => double.tryParse(_perTxCtrl.text.trim());
  double? get _perHour => double.tryParse(_perHourCtrl.text.trim());
  double? get _lifetime => double.tryParse(_lifetimeCtrl.text.trim());

  bool get _valid =>
      (_perTx ?? 0) > 0 && (_perHour ?? 0) > 0 && (_lifetime ?? -1) >= 0;

  void _applyPreset(RiskProfile p) {
    setState(() {
      _risk = p;
      if (p != RiskProfile.custom) {
        final preset = PolicyPreset.presets[p]!;
        _perTxCtrl.text = preset.maxPerTxUsdc.toString();
        _perHourCtrl.text = preset.maxPerHourUsdc.toString();
      }
      if (_error != null) _error = null;
    });
  }

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
        'Authorize new spending policy for this agent',
      );
      if (!ok) {
        if (!mounted) return;
        setState(() {
          _busy = false;
          _error = const OnchainErrorState(
            'Biometric cancelled. Tap again to retry.',
          );
        });
        return;
      }
      HapticFeedback.mediumImpact();
      await GetIt.I<VaultActionService>().updatePolicy(
        ownerPubkeyBase58: wallet.pubkeyBase58,
        agentPubkeyBase58: widget.agent.pubkey,
        walletAuthToken: wallet.authToken,
        perTxLimitUsdc: _perTx!.round(),
        hourlyLimitUsdc: _perHour!.round(),
        lifetimeLimitUsdc: _lifetime!.round(),
        allowPostPay: _allowPostPay,
        whitelistBase58: const [],
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
        _error = OnchainErrorState('Policy update failed: $e');
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
          const _GrabHandle(),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
            child: Row(
              children: [
                const Expanded(
                  child: Text(
                    'Edit policy',
                    style: TextStyle(
                      color: AFColors.fg,
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      letterSpacing: -0.36,
                    ),
                  ),
                ),
                IconButton(
                  onPressed:
                      _busy ? null : () => Navigator.of(context).pop(false),
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
                  const _Label('Preset'),
                  const SizedBox(height: 8),
                  _RiskColumn(
                    selected: _risk,
                    enabled: !_busy,
                    onChanged: _applyPreset,
                    mono: mono,
                  ),
                  const SizedBox(height: 22),
                  const _Label('Limits (whole USDC)'),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: _LimitField(
                          label: 'PER-TX',
                          controller: _perTxCtrl,
                          enabled: !_busy,
                          onChanged: () => setState(() {
                            _risk = RiskProfile.custom;
                            if (_error != null) _error = null;
                          }),
                          mono: mono,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _LimitField(
                          label: 'PER-HOUR',
                          controller: _perHourCtrl,
                          enabled: !_busy,
                          onChanged: () => setState(() {
                            _risk = RiskProfile.custom;
                            if (_error != null) _error = null;
                          }),
                          mono: mono,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  _LimitField(
                    label: 'LIFETIME (0 = no cap)',
                    controller: _lifetimeCtrl,
                    enabled: !_busy,
                    onChanged: () => setState(() {
                      _risk = RiskProfile.custom;
                      if (_error != null) _error = null;
                    }),
                    mono: mono,
                  ),
                  const SizedBox(height: 22),
                  _PostPayToggle(
                    value: _allowPostPay,
                    enabled: !_busy,
                    onChanged: (v) => setState(() => _allowPostPay = v),
                  ),
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
                    ? const Icon(
                        Icons.check,
                        color: Color(0xFF08090B),
                        size: 11,
                      )
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
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: false,
                  ),
                  inputFormatters: [_IntFormatter()],
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

class _IntFormatter extends TextInputFormatter {
  static final _re = RegExp(r'^\d{0,9}$');
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue old,
    TextEditingValue next,
  ) {
    if (next.text.isEmpty) return next;
    return _re.hasMatch(next.text) ? next : old;
  }
}

class _PostPayToggle extends StatelessWidget {
  const _PostPayToggle({
    required this.value,
    required this.enabled,
    required this.onChanged,
  });
  final bool value;
  final bool enabled;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AFColors.surface2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: AFColors.line),
      ),
      child: InkWell(
        onTap: enabled ? () => onChanged(!value) : null,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          child: Row(
            children: [
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Allow post-pay',
                      style: TextStyle(
                        color: AFColors.fg,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Let agents settle x402 invoices after a successful '
                      'API response (off by default — strictly pre-pay).',
                      style: TextStyle(
                        color: AFColors.muted,
                        fontSize: 12,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Switch(
                value: value,
                onChanged: enabled ? onChanged : null,
                activeThumbColor: AFColors.mint,
              ),
            ],
          ),
        ),
      ),
    );
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
                  busy ? 'Updating…' : 'Authorize',
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
