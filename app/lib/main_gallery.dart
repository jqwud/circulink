import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/state.dart';
import 'core/theme.dart';
import 'screens/dev/gallery_screen.dart';

/// Opens the component gallery directly, for design reviews and screenshots:
///   flutter run -t lib/main_gallery.dart     (or flutter build web -t lib/main_gallery.dart)
void main() {
  runApp(ChangeNotifierProvider<AppState>(
    create: (BuildContext c) => AppState(),
    child: MaterialApp(
      title: 'Hiraman gallery',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      builder: (BuildContext context, Widget? child) => ContentFrame(child: child ?? const SizedBox.shrink()),
      home: const GalleryScreen(),
    ),
  ));
}
