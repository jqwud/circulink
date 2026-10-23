import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/state.dart';
import 'core/theme.dart';
import 'screens/gate.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const HiramanApp());
}

class HiramanApp extends StatelessWidget {
  const HiramanApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider<AppState>(
      create: (BuildContext c) => AppState()..init(),
      // Only Simple mode changes the theme, so only it rebuilds the app shell.
      child: Selector<AppState, bool>(
        selector: (BuildContext c, AppState app) => app.simpleMode,
        builder: (BuildContext c, bool simple, Widget? _) => MaterialApp(
          title: 'Hiraman',
          debugShowCheckedModeBanner: false,
          navigatorKey: rootNavigatorKey,
          theme: buildTheme(simple: simple),
          builder: (BuildContext context, Widget? child) => ContentFrame(child: SimpleModeFrame(on: simple, child: child ?? const SizedBox.shrink())),
          home: const Gate(),
        ),
      ),
    );
  }
}
