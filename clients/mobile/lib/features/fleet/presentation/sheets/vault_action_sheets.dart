import 'package:flutter/material.dart';
import 'package:flutter/services.dart'
    show HapticFeedback, TextEditingValue, TextInputFormatter;
import 'package:get_it/get_it.dart';

import '../../../../app/theme.dart';
import '../../../../core/error/exceptions.dart';
import '../../../auth/data/datasources/biometric_service.dart';
import '../../../wallet/data/repositories/wallet_repository.dart';
import '../../data/onchain/vault_action_service.dart';
import '../../domain/entities/agent.dart';

Future<bool?> showFundSheet(BuildContext context, Agent agent) {
  return showModalBottomSheet<bool>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    barrierColor: const Color(0x99000000),
    builder: (_) => _SheetScaffold(
      child: _FundSheetBody(agent: agent),
    ),
  );
}

Future<bool?> showFreezeSheet(BuildContext context, Agent agent) {
  return showModalBottomSheet<bool>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    barrierColor: const Color(0x99000000),
    builder: (_) => _SheetScaffold(
      child: _FreezeSheetBody(agent: agent),
    ),
  );
}

Future<bool?> showApproveSheet(BuildContext context, Agent agent) {
  return showModalBottomSheet<bool>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    barrierColor: const Color(0x99000000),
    builder: (_) => _SheetScaffold(
      child: _ApproveSheetBody(agent: agent),
    ),
  );
}

class _SheetScaffold extends StatelessWidget {
  const _SheetScaffold({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return AnimatedPadding(
      duration: const Duration(milliseconds: 150),
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Container(
        decoration: const BoxDecoration(
          color: Color(0xFF0C0D0F),
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
          border: Border(top: BorderSide(color: AFColors.line2)),
        ),
        padding: EdgeInsets.fromLTRB(
          20,
          12,
          20,
          28 + MediaQuery.of(context).padding.bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 38,
              height: 5,
              margin: const EdgeInsets.only(bottom: 18),
              decoration: BoxDecoration(
                color: const Color(0x2EFFFFFF),
                borderRadius: BorderRadius.circular(100),
              ),
            ),
            child,
          ],
        ),
      ),
    );
  }
}

// ============================================================================
// FUND
// ============================================================================

class _FundSheetBody extends StatefulWidget {
  const _FundSheetBody({required this.agent});
  final Agent agent;

  @override
  State<_FundSheetBody> createState() => _FundSheetBodyState();
}

class _FundSheetBodyState extends State<_FundSheetBody> {
  final _ctrl = TextEditingController(text: '100');
  bool _busy = false;
  String? _error;

  static const _presets = [50, 100, 500, 1000];

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  int? get _amount {
    final t = _ctrl.text.trim();
    if (t.isEmpty) return null;
    final n = int.tryParse(t);
    if (n == null || n <= 0) return null;
    return n;
  }

  Future<void> _submit() async {
    final amount = _amount;
    if (amount == null) {
      setState(() => _error = 'Enter an amount greater than zero.');
      return;
    }
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
      await GetIt.I<VaultActionService>().fund(
        ownerPubkeyBase58: wallet.pubkeyBase58,
        agentPubkeyBase58: widget.agent.pubkey,
        walletAuthToken: wallet.authToken,
        amountUsdc: amount,
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on WalletException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.message;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'Deposit failed: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final mono = Theme.of(context).extension<AFTypography>()!.mono;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        const Text(
          'Fund vault',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: AFColors.fg,
            fontSize: 22,
            fontWeight: FontWeight.w600,
            letterSpacing: -0.44,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Deposit USDC into ${_short(widget.agent.pubkey)}. The agent can spend up to its policy limits.',
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: AFColors.muted,
            fontSize: 14,
            height: 1.45,
          ),
        ),
        const SizedBox(height: 26),
        _BigAmountField(
          controller: _ctrl,
          enabled: !_busy,
          mono: mono,
          onChanged: () {
            if (_error != null) setState(() => _error = null);
          },
        ),
        const SizedBox(height: 18),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            for (final p in _presets) ...[
              _PresetChip(
                amount: p,
                selected: _amount == p,
                onTap: _busy
                    ? null
                    : () {
                        _ctrl.text = p.toString();
                        _ctrl.selection = TextSelection.fromPosition(
                          TextPosition(offset: _ctrl.text.length),
                        );
                        setState(() => _error = null);
                      },
                mono: mono,
              ),
              if (p != _presets.last) const SizedBox(width: 8),
            ],
          ],
        ),
        if (_error != null) ...[
          const SizedBox(height: 14),
          Text(
            _error!,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AFColors.danger, fontSize: 13),
          ),
        ],
        const SizedBox(height: 22),
        _MintButton(
          label: _busy ? 'Authorizing…' : 'Deposit',
          icon: _busy ? null : Icons.arrow_downward,
          onPressed: _busy ? null : _submit,
        ),
        const SizedBox(height: 10),
        _GhostButton(
          label: 'Cancel',
          onPressed: _busy ? null : () => Navigator.of(context).pop(false),
        ),
      ],
    );
  }
}

class _BigAmountField extends StatelessWidget {
  const _BigAmountField({
    required this.controller,
    required this.enabled,
    required this.mono,
    required this.onChanged,
  });
  final TextEditingController controller;
  final bool enabled;
  final TextTheme mono;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '\$',
            style: mono.headlineMedium?.copyWith(
              color: AFColors.muted,
              fontSize: 28,
              fontWeight: FontWeight.w500,
              height: 1.4,
            ),
          ),
          const SizedBox(width: 2),
          IntrinsicWidth(
            child: TextField(
              controller: controller,
              enabled: enabled,
              autofocus: false,
              keyboardType: TextInputType.number,
              inputFormatters: [_IntegerOnlyFormatter()],
              cursorColor: AFColors.mint,
              textAlign: TextAlign.center,
              onChanged: (_) => onChanged(),
              decoration: const InputDecoration(
                isCollapsed: true,
                border: InputBorder.none,
                contentPadding: EdgeInsets.zero,
                hintText: '0',
                hintStyle: TextStyle(color: AFColors.muted2, fontSize: 60),
              ),
              style: mono.displayMedium?.copyWith(
                color: AFColors.mint,
                fontSize: 60,
                fontWeight: FontWeight.w600,
                letterSpacing: -2.4,
                height: 1,
                shadows: const [
                  Shadow(color: AFColors.mintGlow, blurRadius: 32),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _IntegerOnlyFormatter extends TextInputFormatter {
  static final _re = RegExp(r'^\d{0,8}$');

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    if (newValue.text.isEmpty) return newValue;
    if (_re.hasMatch(newValue.text)) return newValue;
    return oldValue;
  }
}

class _PresetChip extends StatelessWidget {
  const _PresetChip({
    required this.amount,
    required this.selected,
    required this.onTap,
    required this.mono,
  });
  final int amount;
  final bool selected;
  final VoidCallback? onTap;
  final TextTheme mono;

  @override
  Widget build(BuildContext context) {
    final color = selected ? AFColors.mint : AFColors.fg2;
    return Material(
      color: selected ? AFColors.mintTint : AFColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: selected ? AFColors.mintDim : AFColors.line,
        ),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          height: 40,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18),
            child: Center(
              child: Text(
                '\$$amount',
                style: mono.bodyMedium?.copyWith(
                  color: color,
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ============================================================================
// FREEZE
// ============================================================================

class _FreezeSheetBody extends StatefulWidget {
  const _FreezeSheetBody({required this.agent});
  final Agent agent;

  @override
  State<_FreezeSheetBody> createState() => _FreezeSheetBodyState();
}

class _FreezeSheetBodyState extends State<_FreezeSheetBody> {
  bool _busy = false;
  bool _done = false;
  String? _error;

  Future<void> _confirmFreeze() async {
    if (_busy || _done) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    HapticFeedback.mediumImpact();
    try {
      final wallet = await GetIt.I<WalletRepository>().cachedConnection();
      if (wallet == null) {
        throw WalletException(
          'Wallet session lost. Reconnect from onboarding.',
          kind: WalletExceptionKind.userCancelled,
        );
      }
      await GetIt.I<VaultActionService>().freeze(
        ownerPubkeyBase58: wallet.pubkeyBase58,
        agentPubkeyBase58: widget.agent.pubkey,
        walletAuthToken: wallet.authToken,
      );
      if (!mounted) return;
      setState(() => _done = true);
      await Future<void>.delayed(const Duration(milliseconds: 350));
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on WalletException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.message;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'Freeze failed: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        const Text(
          'Freeze vault',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: AFColors.fg,
            fontSize: 22,
            fontWeight: FontWeight.w600,
            letterSpacing: -0.44,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          '${_short(widget.agent.pubkey)} will immediately stop all spending. In-flight x402 payments are rejected.',
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: AFColors.muted,
            fontSize: 14,
            height: 1.45,
          ),
        ),
        const SizedBox(height: 22),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: const Color(0x1AE08577),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0x4DE08577)),
          ),
          child: const Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.warning_amber_rounded,
                  color: AFColors.danger, size: 22),
              SizedBox(width: 12),
              Expanded(
                child: Text(
                  "Emergency control. The agent can't transact until you unfreeze the vault. Reputation accrual pauses while frozen.",
                  style: TextStyle(
                    color: AFColors.fg2,
                    fontSize: 13,
                    height: 1.45,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 22),
        _SlideToConfirm(
          armed: _busy || _done,
          done: _done,
          onConfirmed: _confirmFreeze,
        ),
        if (_error != null) ...[
          const SizedBox(height: 14),
          Text(
            _error!,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AFColors.danger, fontSize: 13),
          ),
        ],
        const SizedBox(height: 12),
        _GhostButton(
          label: 'Cancel',
          onPressed: _busy ? null : () => Navigator.of(context).pop(false),
        ),
      ],
    );
  }
}

class _SlideToConfirm extends StatefulWidget {
  const _SlideToConfirm({
    required this.armed,
    required this.done,
    required this.onConfirmed,
  });
  final bool armed;
  final bool done;
  final VoidCallback onConfirmed;

  @override
  State<_SlideToConfirm> createState() => _SlideToConfirmState();
}

class _SlideToConfirmState extends State<_SlideToConfirm> {
  double _x = 0;
  double _maxWidth = 1;
  static const _thumb = 56.0;
  static const _track = 64.0;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        _maxWidth = c.maxWidth - _thumb - 8;
        final frac = (_x / (_maxWidth.clamp(1, double.infinity))).clamp(0.0, 1.0);
        return SizedBox(
          height: _track,
          child: Stack(
            children: [
              Container(
                decoration: BoxDecoration(
                  color: AFColors.surface2,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0x4DE08577)),
                ),
              ),
              Positioned.fill(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: FractionallySizedBox(
                      widthFactor: (_x + _thumb) / c.maxWidth,
                      child: const DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: [Color(0x40E08577), Color(0x80E08577)],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              Center(
                child: Opacity(
                  opacity: widget.done ? 0 : (1 - frac * 0.9),
                  child: const Text(
                    'Slide to freeze',
                    style: TextStyle(
                      color: AFColors.danger,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.84,
                    ),
                  ),
                ),
              ),
              if (widget.armed || widget.done)
                const Center(
                  child: Text(
                    'Freezing…',
                    style: TextStyle(
                      color: AFColors.danger,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.84,
                    ),
                  ),
                ),
              AnimatedPositioned(
                duration: Duration(
                    milliseconds: _x == 0 || _x == _maxWidth ? 220 : 0),
                curve: Curves.easeOutCubic,
                left: 4 + _x,
                top: 4,
                child: GestureDetector(
                  onHorizontalDragUpdate: widget.done || widget.armed
                      ? null
                      : (d) => setState(() {
                            _x = (_x + d.delta.dx).clamp(0.0, _maxWidth);
                          }),
                  onHorizontalDragEnd: widget.done || widget.armed
                      ? null
                      : (_) {
                          if (_x >= _maxWidth - 6) {
                            setState(() => _x = _maxWidth);
                            widget.onConfirmed();
                          } else {
                            setState(() => _x = 0);
                          }
                        },
                  child: Container(
                    width: _thumb,
                    height: _thumb,
                    decoration: BoxDecoration(
                      color: AFColors.danger,
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: const [
                        BoxShadow(
                          color: Color(0x66E08577),
                          blurRadius: 14,
                          offset: Offset(0, 4),
                        ),
                      ],
                    ),
                    child: Icon(
                      widget.done ? Icons.check : Icons.ac_unit,
                      color: const Color(0xFF1A0A08),
                      size: 26,
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

// ============================================================================
// APPROVE (biometric gate — no on-chain action yet)
// ============================================================================

class _ApproveSheetBody extends StatefulWidget {
  const _ApproveSheetBody({required this.agent});
  final Agent agent;

  @override
  State<_ApproveSheetBody> createState() => _ApproveSheetBodyState();
}

enum _ApprovePhase { review, scanning, done }

class _ApproveSheetBodyState extends State<_ApproveSheetBody> {
  _ApprovePhase _phase = _ApprovePhase.review;
  String? _error;

  Future<void> _scan() async {
    setState(() {
      _phase = _ApprovePhase.scanning;
      _error = null;
    });
    final ok = await GetIt.I<BiometricService>().authorize(
      'Approve this spend on ${_short(widget.agent.pubkey)}',
    );
    if (!mounted) return;
    if (!ok) {
      setState(() {
        _phase = _ApprovePhase.review;
        _error = 'Biometric cancelled. Tap again to retry.';
      });
      return;
    }
    HapticFeedback.lightImpact();
    setState(() => _phase = _ApprovePhase.done);
    await Future<void>.delayed(const Duration(milliseconds: 800));
    if (!mounted) return;
    Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final mono = Theme.of(context).extension<AFTypography>()!.mono;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Approve spend',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: AFColors.fg,
            fontSize: 22,
            fontWeight: FontWeight.w600,
            letterSpacing: -0.44,
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'A pending spend exceeded the per-tx limit. Confirm with biometrics to release it.',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: AFColors.muted,
            fontSize: 14,
            height: 1.45,
          ),
        ),
        const SizedBox(height: 20),
        if (_phase == _ApprovePhase.done)
          _ApproveDone()
        else
          _ApproveDetails(agent: widget.agent, mono: mono, phase: _phase),
        if (_error != null) ...[
          const SizedBox(height: 14),
          Text(
            _error!,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AFColors.danger, fontSize: 13),
          ),
        ],
        const SizedBox(height: 18),
        if (_phase == _ApprovePhase.review)
          _MintButton(
            label: 'Authorize with biometric',
            icon: Icons.fingerprint,
            onPressed: _scan,
          ),
        if (_phase == _ApprovePhase.review)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: _GhostButton(
              label: 'Cancel',
              onPressed: () => Navigator.of(context).pop(false),
            ),
          ),
      ],
    );
  }
}

class _ApproveDetails extends StatelessWidget {
  const _ApproveDetails({
    required this.agent,
    required this.mono,
    required this.phase,
  });
  final Agent agent;
  final TextTheme mono;
  final _ApprovePhase phase;

  @override
  Widget build(BuildContext context) {
    final scanning = phase == _ApprovePhase.scanning;
    return Column(
      children: [
        Text(
          '\$14.22',
          textAlign: TextAlign.center,
          style: mono.displayMedium?.copyWith(
            color: AFColors.mint,
            fontSize: 52,
            fontWeight: FontWeight.w600,
            letterSpacing: -1.82,
            height: 1,
            shadows: const [
              Shadow(color: AFColors.mintGlow, blurRadius: 28),
            ],
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'to Cortex Inference',
          textAlign: TextAlign.center,
          style: TextStyle(color: AFColors.muted, fontSize: 13),
        ),
        const SizedBox(height: 18),
        _Row(k: 'Agent', v: _short(agent.pubkey), mono: mono),
        _Row(k: 'Service', v: 'Cortex Inference', mono: mono),
        _Row(k: 'Per-tx limit', v: '\$10.00', mono: mono, last: true),
        if (scanning) ...[
          const SizedBox(height: 24),
          const AnimatedScale(
            scale: 1,
            duration: Duration(milliseconds: 600),
            child: Icon(
              Icons.fingerprint,
              color: AFColors.mint,
              size: 64,
            ),
          ),
          const SizedBox(height: 10),
          const Text(
            'Scanning…',
            style: TextStyle(color: AFColors.muted, fontSize: 14),
          ),
        ],
      ],
    );
  }
}

class _ApproveDone extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 18),
      child: Column(
        children: [
          Container(
            width: 80,
            height: 80,
            decoration: const BoxDecoration(
              color: AFColors.mintTint,
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.check, color: AFColors.mint, size: 40),
          ),
          const SizedBox(height: 14),
          const Text(
            'Approved',
            style: TextStyle(
              color: AFColors.fg,
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.k,
    required this.v,
    required this.mono,
    this.last = false,
  });
  final String k;
  final String v;
  final TextTheme mono;
  final bool last;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(
        border: last
            ? null
            : const Border(
                bottom: BorderSide(color: AFColors.line),
              ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              k,
              style: const TextStyle(color: AFColors.muted, fontSize: 14),
            ),
          ),
          Text(
            v,
            style: mono.bodyMedium?.copyWith(
              color: AFColors.fg,
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }
}

// ============================================================================
// Shared atoms
// ============================================================================

class _MintButton extends StatelessWidget {
  const _MintButton({
    required this.label,
    required this.onPressed,
    this.icon,
  });
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final disabled = onPressed == null;
    return SizedBox(
      height: 52,
      child: Material(
        color: disabled
            ? AFColors.mint.withValues(alpha: 0.4)
            : AFColors.mint,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(16),
          child: Center(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (icon != null) ...[
                  Icon(icon, size: 18, color: const Color(0xFF0A0B0C)),
                  const SizedBox(width: 8),
                ],
                Text(
                  label,
                  style: const TextStyle(
                    color: Color(0xFF0A0B0C),
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

class _GhostButton extends StatelessWidget {
  const _GhostButton({required this.label, required this.onPressed});
  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 52,
      child: Material(
        color: AFColors.surface2,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AFColors.line),
        ),
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(16),
          child: Center(
            child: Text(
              label,
              style: const TextStyle(
                color: AFColors.fg,
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

String _short(String pk, [int n = 4]) =>
    pk.length <= n * 2 ? pk : '${pk.substring(0, n)}…${pk.substring(pk.length - n)}';
