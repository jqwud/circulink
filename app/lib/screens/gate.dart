import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/pawsa.dart';
import 'auth_screens.dart';
import 'home_shell.dart';
import 'onboarding_screen.dart';

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
    return const HomeShell();
  }
}

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: HiColors.cream,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            PawsaImage(pose: 'hero', size: 240),
            SizedBox(height: 12),
            Text('Hiraman', style: TextStyle(fontSize: 34, fontWeight: FontWeight.w900, color: HiColors.ink)),
          ],
        ),
      ),
    );
  }
}
