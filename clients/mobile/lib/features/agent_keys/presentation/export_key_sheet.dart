import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show Clipboard, ClipboardData;
import 'package:get_it/get_it.dart';

import '../../../app/theme.dart';
import '../../auth/data/datasources/biometric_service.dart';
import '../data/datasources/agent_key_store.dart';

Future<void> showExportAgentKeySheet(
  BuildContext context, {
  required String agentPubkey,
}) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    barrierColor: const Color(0x99000000),
    builder: (_) => _ExportKeySheet(agentPubkey: agentPubkey),
  );
}

class _ExportKeySheet extends StatefulWidget {
  const _ExportKeySheet({required this.agentPubkey});
  final String agentPubkey;

  @override
  State<_ExportKeySheet> createState() => _ExportKeySheetState();
}

enum _ExportPhase { idle, scanning, revealed, missing }

class _ExportKeySheetState extends State<_ExportKeySheet> {
  _ExportPhase _phase = _ExportPhase.idle;
  String? _secretJson;
  String? _error;

  Future<void> _reveal() async {
    setState(() {
      _phase = _ExportPhase.scanning;
      _error = null;
    });
    final ok = await GetIt.I<BiometricService>().authorize(
      'Reveal the secret key for this agent',
    );
    if (!mounted) return;
    if (!ok) {
      setState(() {
        _phase = _ExportPhase.idle;
        _error = 'Biometric cancelled. Tap again to retry.';
      });
      return;
    }
    final bytes = await GetIt.I<AgentKeyStore>()
        .readSolanaSecret(widget.agentPubkey);
    if (!mounted) return;
    if (bytes == null) {
      setState(() => _phase = _ExportPhase.missing);
      return;
    }
    setState(() {
      _secretJson = jsonEncode(bytes);
      _phase = _ExportPhase.revealed;
    });
  }

  Future<void> _copy() async {
    final json = _secretJson;
    if (json == null) return;
    await Clipboard.setData(ClipboardData(text: json));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        backgroundColor: AFColors.surface2,
        content: Text(
          'Copied. Paste it into your agent runtime, then clear your clipboard.',
          style: TextStyle(color: AFColors.fg),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final mono = Theme.of(context).extension<AFTypography>()!.mono;
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
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _GrabHandle(),
            const Text(
              'Export agent key',
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
              'Anyone with this secret can sign spends from this agent. '
              "Don't paste it anywhere except a runtime you trust.",
              textAlign: TextAlign.center,
              style: TextStyle(
                color: AFColors.muted,
                fontSize: 14,
                height: 1.45,
              ),
            ),
            const SizedBox(height: 20),
            _WarningBox(),
            const SizedBox(height: 16),
            if (_phase == _ExportPhase.revealed)
              _SecretBlock(secretJson: _secretJson!, mono: mono)
            else if (_phase == _ExportPhase.missing)
              const _MissingBox()
            else if (_phase == _ExportPhase.scanning)
              const _ScanningBox()
            else
              _HiddenBox(mono: mono, agentPubkey: widget.agentPubkey),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AFColors.danger, fontSize: 13),
              ),
            ],
            const SizedBox(height: 18),
            if (_phase == _ExportPhase.revealed)
              _MintButton(
                label: 'Copy',
                icon: Icons.copy,
                onPressed: _copy,
              )
            else if (_phase == _ExportPhase.missing)
              _GhostButton(
                label: 'Close',
                onPressed: () => Navigator.of(context).pop(),
              )
            else
              _MintButton(
                label: 'Reveal with biometric',
                icon: Icons.fingerprint,
                onPressed:
                    _phase == _ExportPhase.scanning ? null : _reveal,
              ),
            if (_phase == _ExportPhase.revealed)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: _GhostButton(
                  label: 'Done',
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _GrabHandle extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 38,
        height: 5,
        margin: const EdgeInsets.only(bottom: 18),
        decoration: BoxDecoration(
          color: const Color(0x2EFFFFFF),
          borderRadius: BorderRadius.circular(100),
        ),
      ),
    );
  }
}

class _WarningBox extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0x1AE08577),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0x4DE08577)),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.warning_amber_rounded,
              color: AFColors.danger, size: 20),
          SizedBox(width: 12),
          Expanded(
            child: Text(
              'Treat this like a wallet seed phrase. We only store it on '
              'this device — clearing app storage destroys it.',
              style: TextStyle(
                color: AFColors.fg2,
                fontSize: 13,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _HiddenBox extends StatelessWidget {
  const _HiddenBox({required this.mono, required this.agentPubkey});
  final TextTheme mono;
  final String agentPubkey;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
      decoration: BoxDecoration(
        color: AFColors.surface2,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AFColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'AGENT PUBKEY',
            style: TextStyle(
              color: AFColors.muted,
              fontSize: 10.5,
              letterSpacing: 0.63,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            agentPubkey,
            style: mono.bodyMedium?.copyWith(
              color: AFColors.fg,
              fontSize: 13,
            ),
          ),
          const SizedBox(height: 14),
          const Text(
            'SECRET (64 bytes, JSON array)',
            style: TextStyle(
              color: AFColors.muted,
              fontSize: 10.5,
              letterSpacing: 0.63,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 6),
          const Row(
            children: [
              Icon(Icons.lock_outline, color: AFColors.muted, size: 16),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Hidden. Biometric required to reveal.',
                  style: TextStyle(color: AFColors.muted, fontSize: 13.5),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SecretBlock extends StatelessWidget {
  const _SecretBlock({required this.secretJson, required this.mono});
  final String secretJson;
  final TextTheme mono;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
      decoration: BoxDecoration(
        color: AFColors.surface2,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AFColors.mintDim),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'SECRET (64 bytes, JSON array)',
            style: TextStyle(
              color: AFColors.mintDim,
              fontSize: 10.5,
              letterSpacing: 0.63,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 8),
          SelectableText(
            secretJson,
            style: mono.bodySmall?.copyWith(
              color: AFColors.fg,
              fontSize: 12.5,
              height: 1.45,
            ),
          ),
        ],
      ),
    );
  }
}

class _MissingBox extends StatelessWidget {
  const _MissingBox();
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AFColors.surface2,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AFColors.line),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.cloud_off, color: AFColors.muted, size: 20),
          SizedBox(width: 12),
          Expanded(
            child: Text(
              'No secret stored on this device for this agent. It was either '
              "created before we shipped key persistence, or you've cleared "
              'app storage. The agent still works on chain, but you can no '
              'longer export.',
              style: TextStyle(
                color: AFColors.muted,
                fontSize: 13,
                height: 1.45,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ScanningBox extends StatelessWidget {
  const _ScanningBox();
  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 20),
      child: Column(
        children: [
          Icon(Icons.fingerprint, color: AFColors.mint, size: 64),
          SizedBox(height: 10),
          Text(
            'Scanning…',
            style: TextStyle(color: AFColors.muted, fontSize: 14),
          ),
        ],
      ),
    );
  }
}

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
