import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/brand_mark.dart';
import 'auth_screens.dart';
import 'home_shell.dart';
import 'onboarding_screen.dart';
import 'password_screen.dart';
import 'privacy_screens.dart';

/// Decides what to show: loading, first-time intro, login, or the app.
class Gate extends StatelessWidget {
  const Gate({super.key});

  @override
  Widget build(BuildContext context) {
    final AppState app = context.watch<AppState>();
    if (!app.ready) return const _Splash();
    if (app.user == null) {
      return app.seenOnboarding ? const LoginScreen() : const OnboardingScreen();
    }
    // Residents who joined before the privacy notice existed (or before it changed) agree once.
    if (app.user?['role'] == 'resident' && app.user?['privacy_ok'] == false) return const PrivacyScreen(mustAccept: true);
    // After a staff-assisted reset the person picks their own password first.
    if (app.user?['must_change_password'] == true) return const ChangePasswordScreen(forced: true);
    return const HomeShell();
  }
}

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: HiColors.cream,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const BrandMark(size: 140),
            const SizedBox(height: 4),
            const BrandWordmark(),
            const SizedBox(height: 4),
            Text(context.t('Keep it in the loop.'), style: HiText.body.copyWith(color: HiColors.muted)),
            const SizedBox(height: 22),
            SizedBox(
              width: 120,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(HiRadius.pill),
                child: const LinearProgressIndicator(minHeight: 5, color: HiColors.primary, backgroundColor: HiColors.mutedSoft),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
