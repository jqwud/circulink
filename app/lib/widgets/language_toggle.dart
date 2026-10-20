import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/theme.dart';

/// Filipino / English switch, used on onboarding, login and the profile.
class LanguageToggle extends StatelessWidget {
  const LanguageToggle({super.key});

  @override
  Widget build(BuildContext context) {
    final String current = context.lang;
    return SegmentedButton<String>(
      showSelectedIcon: false,
      style: SegmentedButton.styleFrom(
        selectedBackgroundColor: HiColors.primary,
        selectedForegroundColor: HiColors.onPrimary,
        foregroundColor: HiColors.muted,
        visualDensity: VisualDensity.compact,
      ),
      segments: const <ButtonSegment<String>>[
        ButtonSegment<String>(value: 'fil', label: Text('Filipino')),
        ButtonSegment<String>(value: 'en', label: Text('English')),
      ],
      selected: <String>{current},
      onSelectionChanged: (Set<String> s) => context.app.setLang(s.first),
    );
  }
}
