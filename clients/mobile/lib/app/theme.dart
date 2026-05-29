import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AFColors {
  static const bg = Color(0xFF0B0C0E);
  static const surface = Color(0xFF0E0F11);
  static const surface2 = Color(0xFF15181B);
  static const surface3 = Color(0xFF1E2226);
  static const line = Color(0x1FFFFFFF);
  static const line2 = Color(0x14FFFFFF);

  static const fg = Color(0xFFE5E7EA);
  static const fg2 = Color(0xFFB7BEC5);
  static const muted = Color(0xFF7B848C);

  static const mint = Color(0xFFA6E1CF);
  static const mintSoft = Color(0xFF7FBDA8);
  static const mintGlow = Color(0x66A6E1CF);

  static const watch = Color(0xFFE6B86F);
  static const danger = Color(0xFFE08577);
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
