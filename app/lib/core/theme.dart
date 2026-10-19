import 'package:flutter/material.dart';

/// Colors come from brand/tokens.json so the app and the LGU portal look like one product.
class HiColors {
  static const Color primary = Color(0xFFB8560A);
  static const Color primarySoft = Color(0xFFFDE7CF);
  static const Color fur = Color(0xFFF5A04A);
  static const Color cream = Color(0xFFFFF8EE);
  static const Color card = Color(0xFFFFFFFF);
  static const Color ink = Color(0xFF22304A);
  static const Color muted = Color(0xFF6B7690);
  static const Color leaf = Color(0xFF1F7A50);
  static const Color leafSoft = Color(0xFFDDF3E8);
  static const Color warn = Color(0xFF7A5410);
  static const Color warnSoft = Color(0xFFFDF1D6);
  static const Color danger = Color(0xFFC0392B);
  static const Color dangerSoft = Color(0xFFFBE3E0);
  static const Color info = Color(0xFF1B4F9C);
  static const Color infoSoft = Color(0xFFE3EFFF);
  static const Color line = Color(0xFFEADFCF);
  static const Color mutedSoft = Color(0xFFEEE8DD);
}

const double kRadius = 18;

ThemeData buildTheme() {
  final ColorScheme scheme = ColorScheme.fromSeed(
    seedColor: HiColors.primary,
    brightness: Brightness.light,
  ).copyWith(
    primary: HiColors.primary,
    onPrimary: Colors.white,
    surface: HiColors.cream,
    onSurface: HiColors.ink,
    error: HiColors.danger,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: HiColors.cream,
    visualDensity: VisualDensity.standard,
  );
}

/// Shared app bar so every screen looks the same.
PreferredSizeWidget hiAppBar(String title, {List<Widget>? actions, bool showBack = true}) {
  return AppBar(
    title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800, color: HiColors.ink)),
    backgroundColor: HiColors.cream,
    surfaceTintColor: Colors.transparent,
    elevation: 0,
    scrolledUnderElevation: 0,
    centerTitle: false,
    automaticallyImplyLeading: showBack,
    iconTheme: const IconThemeData(color: HiColors.ink),
    actions: actions,
  );
}

/// Used so a login that expires deep in the app can pop back to the root.
final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();
