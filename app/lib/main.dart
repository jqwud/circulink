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
      child: MaterialApp(
        title: 'Hiraman',
        debugShowCheckedModeBanner: false,
        navigatorKey: rootNavigatorKey,
        theme: buildTheme(),
        builder: (BuildContext context, Widget? child) => ContentFrame(child: child ?? const SizedBox.shrink()),
        home: const Gate(),
      ),
    );
  }
}
