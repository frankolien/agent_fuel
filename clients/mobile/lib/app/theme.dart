import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AFColors {
  static const bg = Color(0xFF000000);
  static const surface = Color(0xFF0E0F11);
  static const surface2 = Color(0xFF15171A);
  static const surface3 = Color(0xFF1E2024);
  static const line = Color(0x17FFFFFF);
  static const line2 = Color(0x29FFFFFF);

  static const fg = Color(0xFFFFFFFF);
  static const fg2 = Color(0xFFDCDFE2);
  static const muted = Color(0xFF9DA1A6);
  static const muted2 = Color(0xFF6A6E72);

  static const mint = Color(0xFFD9F0E8);
  static const mintDim = Color(0xFFB8E2D4);
  static const mintDark = Color(0xFF6FA493);
  static const mintSoft = Color(0xFF7FBDA8);
  static const mintGlow = Color(0x8CD9F0E8);
  static const mintTint = Color(0x24D9F0E8);

  static const watch = Color(0xFFE6B86F);
  static const danger = Color(0xFFE08577);
  static const dangerSoft = Color(0x29E08577);
}

ThemeData buildTheme() {
  final base = ThemeData.dark(useMaterial3: true);
  final monoTextTheme = GoogleFonts.jetBrainsMonoTextTheme(base.textTheme);

  const scheme = ColorScheme.dark(
    brightness: Brightness.dark,
    surface: AFColors.surface,
    surfaceContainerHighest: AFColors.surface2,
    primary: AFColors.mint,
    onPrimary: AFColors.bg,
    secondary: AFColors.watch,
    error: AFColors.danger,
    outline: AFColors.line,
  );

  return base.copyWith(
    colorScheme: scheme,
    scaffoldBackgroundColor: AFColors.bg,
    canvasColor: AFColors.bg,
    textTheme: base.textTheme.apply(
      bodyColor: AFColors.fg,
      displayColor: AFColors.fg,
    ),
    extensions: [AFTypography(mono: monoTextTheme)],
    appBarTheme: const AppBarTheme(
      backgroundColor: AFColors.bg,
      foregroundColor: AFColors.fg,
      elevation: 0,
      centerTitle: false,
    ),
    cardTheme: const CardThemeData(
      color: AFColors.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        side: BorderSide(color: AFColors.line2),
        borderRadius: BorderRadius.all(Radius.circular(12)),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AFColors.mint,
        foregroundColor: AFColors.bg,
        shape: const StadiumBorder(),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
      ),
    ),
  );
}

@immutable
class AFTypography extends ThemeExtension<AFTypography> {
  const AFTypography({required this.mono});
  final TextTheme mono;

  @override
  AFTypography copyWith({TextTheme? mono}) =>
      AFTypography(mono: mono ?? this.mono);

  @override
  AFTypography lerp(ThemeExtension<AFTypography>? other, double t) => this;
}
