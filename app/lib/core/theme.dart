import 'package:flutter/material.dart';

/// Design tokens. Colors, radii, spacing and shadows mirror brand/tokens.json
/// so the app and the LGU portal look like one product.
class HiColors {
  /// Lime: fills only (buttons, selected states). Text and icons on it use [onPrimary].
  static const Color primary = Color(0xFFA3E635);
  static const Color primarySoft = Color(0xFFECFCCB);
  static const Color mint = Color(0xFFD9F99D);
  static const Color onPrimary = Color(0xFF1F2A1F);

  /// Leaf green for links and small icons on light backgrounds (4.9:1 on ivory).
  static const Color accent = Color(0xFF4D7C0F);

  /// Sun yellow: credits, rewards, the sun emblem.
  static const Color sun = Color(0xFFFACC15);
  static const Color sunSoft = Color(0xFFFEF3C7);

  /// Pawsa's own orange. Only the mascot uses it.
  static const Color fur = Color(0xFFF5A04A);
  static const Color cream = Color(0xFFFFFDF2);
  static const Color card = Color(0xFFFFFFFF);
  static const Color surfaceMuted = Color(0xFFF6F4E4);
  static const Color ink = Color(0xFF1F2A1F);
  static const Color muted = Color(0xFF4B5F52);
  static const Color mutedSoft = Color(0xFFE9EADC);

  /// Success is teal so it never fights the green brand.
  static const Color leaf = Color(0xFF0F766E);
  static const Color leafSoft = Color(0xFFD5F3EE);
  static const Color warn = Color(0xFF7A5410);
  static const Color warnSoft = Color(0xFFFDF1D6);
  static const Color danger = Color(0xFFB42318);
  static const Color dangerSoft = Color(0xFFFEE4E2);
  static const Color info = Color(0xFF1B4F9C);
  static const Color infoSoft = Color(0xFFE3EFFF);

  /// Kapitbahay (a neighbor's item): purple, so it never looks like the barangay's blue or the brand green.
  static const Color neighbor = Color(0xFF6B3FA0);
  static const Color neighborSoft = Color(0xFFF1EAFB);
  static const Color line = Color(0xFFE8E2C8);
  static const Color lineStrong = Color(0xFFD3CDB0);
}

class HiSpace {
  static const double xs = 4;
  static const double sm = 8;
  static const double ms = 12;
  static const double md = 16;
  static const double lg = 24;
  static const double xl = 32;

  /// Side padding of a screen.
  static const double gutter = 20;
}

class HiRadius {
  static const double sm = 10;
  static const double md = 14;
  static const double lg = 20;
  static const double pill = 999;
}

/// Kept for screens that have not moved to [HiRadius] yet.
const double kRadius = HiRadius.lg;

/// Soft shadows tinted with ink. card: resting cards, float: bars and sheets, modal: dialogs.
class HiShadow {
  static const List<BoxShadow> card = <BoxShadow>[
    BoxShadow(color: Color(0x0D1F2A1F), offset: Offset(0, 1), blurRadius: 2),
    BoxShadow(color: Color(0x0D1F2A1F), offset: Offset(0, 2), blurRadius: 8),
  ];
  static const List<BoxShadow> float = <BoxShadow>[
    BoxShadow(color: Color(0x0F1F2A1F), offset: Offset(0, 2), blurRadius: 6),
    BoxShadow(color: Color(0x141F2A1F), offset: Offset(0, 8), blurRadius: 24),
  ];
  static const List<BoxShadow> modal = <BoxShadow>[
    BoxShadow(color: Color(0x141F2A1F), offset: Offset(0, 8), blurRadius: 16),
    BoxShadow(color: Color(0x241F2A1F), offset: Offset(0, 20), blurRadius: 48),
  ];
}

/// The type scale. Heavy weights are for headings only.
class HiText {
  static const String family = 'Nunito';
  static const TextStyle display = TextStyle(fontSize: 32, fontWeight: FontWeight.w800, height: 1.15, color: HiColors.ink, letterSpacing: -0.4);
  static const TextStyle h1 = TextStyle(fontSize: 24, fontWeight: FontWeight.w800, height: 1.2, color: HiColors.ink, letterSpacing: -0.2);
  static const TextStyle h2 = TextStyle(fontSize: 20, fontWeight: FontWeight.w700, height: 1.25, color: HiColors.ink);
  static const TextStyle title = TextStyle(fontSize: 17, fontWeight: FontWeight.w700, height: 1.3, color: HiColors.ink);
  static const TextStyle body = TextStyle(fontSize: 15, fontWeight: FontWeight.w400, height: 1.45, color: HiColors.ink);
  static const TextStyle label = TextStyle(fontSize: 13, fontWeight: FontWeight.w600, height: 1.35, color: HiColors.ink);
  static const TextStyle caption = TextStyle(fontSize: 12, fontWeight: FontWeight.w400, height: 1.35, color: HiColors.muted);
}

/// The widest the app's content gets on a big screen, like Chrome on a desktop.
const double kContentMaxWidth = 600;

ThemeData buildTheme() {
  final ColorScheme scheme = ColorScheme.fromSeed(
    seedColor: HiColors.primary,
    brightness: Brightness.light,
  ).copyWith(
    primary: HiColors.primary,
    onPrimary: HiColors.onPrimary,
    primaryContainer: HiColors.primarySoft,
    onPrimaryContainer: HiColors.ink,
    secondary: HiColors.ink,
    onSecondary: Colors.white,
    surface: HiColors.card,
    onSurface: HiColors.ink,
    onSurfaceVariant: HiColors.muted,
    surfaceTint: Colors.transparent,
    surfaceContainerLowest: HiColors.card,
    surfaceContainerLow: HiColors.card,
    surfaceContainer: HiColors.card,
    surfaceContainerHigh: HiColors.card,
    surfaceContainerHighest: HiColors.surfaceMuted,
    outline: HiColors.lineStrong,
    outlineVariant: HiColors.line,
    error: HiColors.danger,
    shadow: HiColors.ink,
  );

  const TextTheme text = TextTheme(
    displaySmall: HiText.display,
    headlineMedium: HiText.h1,
    headlineSmall: HiText.h1,
    titleLarge: HiText.h2,
    titleMedium: HiText.title,
    titleSmall: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, height: 1.3, color: HiColors.ink),
    bodyLarge: TextStyle(fontSize: 16, fontWeight: FontWeight.w400, height: 1.45, color: HiColors.ink),
    bodyMedium: HiText.body,
    bodySmall: HiText.caption,
    labelLarge: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, height: 1.2),
    labelMedium: HiText.label,
    labelSmall: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, height: 1.3),
  );

  final RoundedRectangleBorder controlShape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(HiRadius.md));
  OutlineInputBorder inputBorder(Color color, [double width = 1]) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(HiRadius.md),
        borderSide: BorderSide(color: color, width: width),
      );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    fontFamily: HiText.family,
    textTheme: text,
    scaffoldBackgroundColor: HiColors.cream,
    canvasColor: HiColors.card,
    visualDensity: VisualDensity.standard,
    splashFactory: InkRipple.splashFactory,
    dividerTheme: const DividerThemeData(color: HiColors.line, thickness: 1, space: 1),
    iconTheme: const IconThemeData(color: HiColors.ink, size: 22),
    appBarTheme: const AppBarTheme(
      backgroundColor: HiColors.cream,
      foregroundColor: HiColors.ink,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleSpacing: HiSpace.md,
      titleTextStyle: TextStyle(fontFamily: HiText.family, fontSize: 20, fontWeight: FontWeight.w800, color: HiColors.ink),
      iconTheme: IconThemeData(color: HiColors.ink),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: HiColors.primary,
        foregroundColor: HiColors.onPrimary,
        disabledBackgroundColor: HiColors.mutedSoft,
        disabledForegroundColor: HiColors.muted,
        minimumSize: const Size(0, 52),
        padding: const EdgeInsets.symmetric(horizontal: HiSpace.lg),
        shape: controlShape,
        elevation: 0,
        textStyle: const TextStyle(fontFamily: HiText.family, fontSize: 16, fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: HiColors.ink,
        backgroundColor: HiColors.card,
        minimumSize: const Size(0, 48),
        padding: const EdgeInsets.symmetric(horizontal: HiSpace.md + 4),
        side: const BorderSide(color: HiColors.lineStrong),
        shape: controlShape,
        textStyle: const TextStyle(fontFamily: HiText.family, fontSize: 15, fontWeight: FontWeight.w700),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: HiColors.accent,
        shape: controlShape,
        textStyle: const TextStyle(fontFamily: HiText.family, fontSize: 14, fontWeight: FontWeight.w700),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(style: IconButton.styleFrom(foregroundColor: HiColors.ink)),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: HiColors.primary,
      foregroundColor: HiColors.onPrimary,
      elevation: 3,
      focusElevation: 3,
      hoverElevation: 4,
      highlightElevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(HiRadius.lg)),
      extendedTextStyle: const TextStyle(fontFamily: HiText.family, fontSize: 15, fontWeight: FontWeight.w700),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: HiColors.card,
      contentPadding: const EdgeInsets.symmetric(horizontal: HiSpace.md, vertical: 14),
      labelStyle: const TextStyle(color: HiColors.muted, fontWeight: FontWeight.w500),
      floatingLabelStyle: const TextStyle(color: HiColors.accent, fontWeight: FontWeight.w700),
      hintStyle: const TextStyle(color: HiColors.muted),
      helperStyle: HiText.caption,
      prefixIconColor: HiColors.muted,
      suffixIconColor: HiColors.muted,
      border: inputBorder(HiColors.line),
      enabledBorder: inputBorder(HiColors.line),
      disabledBorder: inputBorder(HiColors.mutedSoft),
      focusedBorder: inputBorder(HiColors.accent, 1.8),
      errorBorder: inputBorder(HiColors.danger),
      focusedErrorBorder: inputBorder(HiColors.danger, 1.6),
    ),
    chipTheme: const ChipThemeData(
      backgroundColor: HiColors.card,
      selectedColor: HiColors.ink,
      side: BorderSide(color: HiColors.line),
      shape: StadiumBorder(),
      labelStyle: TextStyle(fontFamily: HiText.family, fontSize: 14, fontWeight: FontWeight.w600, color: HiColors.ink),
      padding: EdgeInsets.symmetric(horizontal: 6, vertical: 4),
      showCheckmark: false,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: HiColors.card,
      surfaceTintColor: Colors.transparent,
      shadowColor: HiColors.ink,
      elevation: 8,
      height: 68,
      indicatorColor: HiColors.primary,
      indicatorShape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(HiRadius.md)),
      labelTextStyle: WidgetStateProperty.resolveWith((Set<WidgetState> s) => TextStyle(
            fontFamily: HiText.family,
            fontSize: 12,
            fontWeight: s.contains(WidgetState.selected) ? FontWeight.w800 : FontWeight.w600,
            color: s.contains(WidgetState.selected) ? HiColors.ink : HiColors.muted,
          )),
      iconTheme: WidgetStateProperty.resolveWith((Set<WidgetState> s) => IconThemeData(
            size: 24,
            color: s.contains(WidgetState.selected) ? HiColors.onPrimary : HiColors.muted,
          )),
    ),
    tabBarTheme: const TabBarThemeData(
      labelColor: HiColors.ink,
      unselectedLabelColor: HiColors.muted,
      indicatorColor: HiColors.accent,
      indicatorSize: TabBarIndicatorSize.label,
      dividerColor: HiColors.line,
      labelStyle: TextStyle(fontFamily: HiText.family, fontSize: 15, fontWeight: FontWeight.w800),
      unselectedLabelStyle: TextStyle(fontFamily: HiText.family, fontSize: 15, fontWeight: FontWeight.w600),
      indicator: UnderlineTabIndicator(
        borderSide: BorderSide(color: HiColors.accent, width: 3),
        borderRadius: BorderRadius.vertical(top: Radius.circular(3)),
      ),
    ),
    cardTheme: CardThemeData(
      color: HiColors.card,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(HiRadius.lg)),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: HiColors.card,
      surfaceTintColor: Colors.transparent,
      elevation: 12,
      shadowColor: const Color(0x661F2A1F),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(HiRadius.lg + 4)),
      titleTextStyle: const TextStyle(fontFamily: HiText.family, fontSize: 20, fontWeight: FontWeight.w800, color: HiColors.ink),
      contentTextStyle: HiText.body,
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: HiColors.card,
      surfaceTintColor: Colors.transparent,
      modalBackgroundColor: HiColors.card,
      showDragHandle: true,
      dragHandleColor: HiColors.lineStrong,
      dragHandleSize: Size(40, 4),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(HiRadius.lg + 4))),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: HiColors.ink,
      elevation: 4,
      insetPadding: const EdgeInsets.fromLTRB(HiSpace.md, 0, HiSpace.md, HiSpace.md),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(HiRadius.md)),
      contentTextStyle: const TextStyle(fontFamily: HiText.family, fontSize: 14, fontWeight: FontWeight.w600, color: Colors.white),
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: HiColors.card,
      surfaceTintColor: Colors.transparent,
      elevation: 8,
      shadowColor: const Color(0x661F2A1F),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(HiRadius.md)),
    ),
    listTileTheme: const ListTileThemeData(iconColor: HiColors.accent, textColor: HiColors.ink),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: HiColors.accent, linearTrackColor: HiColors.mutedSoft),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((Set<WidgetState> s) => s.contains(WidgetState.selected) ? Colors.white : HiColors.lineStrong),
      trackOutlineColor: WidgetStateProperty.resolveWith((Set<WidgetState> s) => s.contains(WidgetState.selected) ? Colors.transparent : HiColors.lineStrong),
      trackColor: WidgetStateProperty.resolveWith((Set<WidgetState> s) => s.contains(WidgetState.selected) ? HiColors.accent : HiColors.surfaceMuted),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: SegmentedButton.styleFrom(
        side: const BorderSide(color: HiColors.line),
        textStyle: const TextStyle(fontFamily: HiText.family, fontWeight: FontWeight.w700),
      ),
    ),
    datePickerTheme: DatePickerThemeData(
      backgroundColor: HiColors.card,
      surfaceTintColor: Colors.transparent,
      headerBackgroundColor: HiColors.cream,
      headerForegroundColor: HiColors.ink,
      rangePickerBackgroundColor: HiColors.card,
      rangePickerSurfaceTintColor: Colors.transparent,
      rangePickerHeaderBackgroundColor: HiColors.cream,
      rangePickerHeaderForegroundColor: HiColors.ink,
      rangeSelectionBackgroundColor: HiColors.primarySoft,
      todayBorder: const BorderSide(color: HiColors.accent),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(HiRadius.lg + 4)),
    ),
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(color: HiColors.ink, borderRadius: BorderRadius.circular(HiRadius.sm)),
      textStyle: const TextStyle(fontFamily: HiText.family, fontSize: 12, fontWeight: FontWeight.w600, color: Colors.white),
    ),
  );
}

/// On a wide screen (Chrome on a desktop), keeps the app in a centered column
/// instead of stretching every card edge to edge. Dialogs and sheets stay inside it too.
class ContentFrame extends StatelessWidget {
  final Widget child;
  const ContentFrame({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    final MediaQueryData mq = MediaQuery.of(context);
    if (mq.size.width <= kContentMaxWidth + 40) return child;
    return ColoredBox(
      color: HiColors.mutedSoft,
      child: Center(
        child: Container(
          width: kContentMaxWidth,
          decoration: const BoxDecoration(color: HiColors.cream, boxShadow: HiShadow.float),
          child: MediaQuery(
            data: mq.copyWith(size: Size(kContentMaxWidth, mq.size.height)),
            child: ClipRect(child: child),
          ),
        ),
      ),
    );
  }
}

/// Shared app bar so every screen looks the same.
PreferredSizeWidget hiAppBar(String title, {List<Widget>? actions, bool showBack = true}) {
  return AppBar(
    title: Text(title),
    automaticallyImplyLeading: showBack,
    actions: actions,
  );
}

/// Used so a login that expires deep in the app can pop back to the root.
final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();
