import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/state.dart';
import 'core/theme.dart';
import 'screens/gate.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const CircuLinkApp());
}

class CircuLinkApp extends StatelessWidget {
  const CircuLinkApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider<AppState>(
      create: (BuildContext c) => AppState()..init(),
      child: MaterialApp(
        title: 'CircuLink',
        debugShowCheckedModeBanner: false,
        navigatorKey: rootNavigatorKey,
        theme: buildTheme(),
        builder: (BuildContext context, Widget? child) => ContentFrame(child: child ?? const SizedBox.shrink()),
        home: const Gate(),
      ),
    );
  }
}
