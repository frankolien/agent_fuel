import 'package:flutter/material.dart';

import '../../app/theme.dart';

/// What every on-chain action surfaces on failure: a human-readable
/// message and (when we have it) the program-log lines for diagnostics.
/// Construct from an [OnchainSimulationException] catch site by passing
/// `.message` and `.logs`; for non-simulation errors, pass `[]` for logs.
class OnchainErrorState {
  const OnchainErrorState(this.message, [this.logs = const []]);
  final String message;
  final List<String> logs;
}

/// Renders an [OnchainErrorState] as a danger-tinted card with a
/// "Show program log" toggle. Pattern-matches common log strings and
/// adds a friendly hint when one fires.
class OnchainErrorCard extends StatefulWidget {
  const OnchainErrorCard({super.key, required this.error});
  final OnchainErrorState error;

  @override
  State<OnchainErrorCard> createState() => _OnchainErrorCardState();
}

class _OnchainErrorCardState extends State<OnchainErrorCard> {
  bool _showLogs = false;

  String? _hintFor(OnchainErrorState error) {
    final lower = '${error.message}\n${error.logs.join('\n')}'.toLowerCase();
    if (lower.contains('insufficient funds')) {
      return "The source token account doesn't hold enough USDC for this "
          'transfer. Top up the wallet (or vault) first, then retry.';
    }
    if (lower.contains('account already in use') ||
        lower.contains('alreadyinuse')) {
      return 'That account already exists on chain. Wait a few seconds for '
          'the backend to catch up, then try again.';
    }
    if (lower.contains('frozen')) {
      return 'The vault is frozen. Unfreeze it before retrying this action.';
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final mono = Theme.of(context).extension<AFTypography>()!.mono;
    final hasLogs = widget.error.logs.isNotEmpty;
    final hint = _hintFor(widget.error);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: const Color(0x1AE08577),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0x4DE08577)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(
                Icons.error_outline,
                color: AFColors.danger,
                size: 18,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  widget.error.message,
                  style: const TextStyle(
                    color: AFColors.fg,
                    fontSize: 13,
                    height: 1.4,
                  ),
                ),
              ),
            ],
          ),
          if (hint != null) ...[
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.only(left: 28),
              child: Text(
                hint,
                style: const TextStyle(
                  color: AFColors.fg2,
                  fontSize: 12.5,
                  height: 1.45,
                ),
              ),
            ),
          ],
          if (hasLogs) ...[
            const SizedBox(height: 10),
            InkWell(
              onTap: () => setState(() => _showLogs = !_showLogs),
              borderRadius: BorderRadius.circular(6),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 4),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      _showLogs ? 'Hide program log' : 'Show program log',
                      style: const TextStyle(
                        color: AFColors.danger,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.4,
                      ),
                    ),
                    Icon(
                      _showLogs ? Icons.expand_less : Icons.expand_more,
                      color: AFColors.danger,
                      size: 16,
                    ),
                  ],
                ),
              ),
            ),
            if (_showLogs) ...[
              const SizedBox(height: 6),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xFF0A0B0C),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AFColors.line),
                ),
                child: SelectableText(
                  widget.error.logs.join('\n'),
                  style: mono.bodySmall?.copyWith(
                    color: AFColors.fg2,
                    fontSize: 10.5,
                    height: 1.45,
                  ),
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }
}
