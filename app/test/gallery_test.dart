// The component gallery renders every component without layout errors, on a small and a regular phone,
// and with large text (200%).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hiraman/core/state.dart';
import 'package:hiraman/core/theme.dart';
import 'package:hiraman/screens/dev/gallery_screen.dart';
import 'package:provider/provider.dart';

Future<void> showGallery(WidgetTester tester, Size size, {double textScale = 1}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(ChangeNotifierProvider<AppState>(
    create: (BuildContext c) => AppState(),
    child: MaterialApp(
      theme: buildTheme(),
      builder: (BuildContext c, Widget? child) => MediaQuery(data: MediaQuery.of(c).copyWith(textScaler: TextScaler.linear(textScale)), child: child!),
      home: const GalleryScreen(),
    ),
  ));
  await tester.pump();
}

/// Scrolls through the whole gallery so every component is built and laid out.
Future<void> scrollAll(WidgetTester tester) async {
  for (int i = 0; i < 40; i++) {
    await tester.drag(find.byType(ListView).first, const Offset(0, -400));
    await tester.pump();
  }
}

void main() {
  for (final (String name, Size size, double scale) in <(String, Size, double)>[
    ('a small phone', const Size(320, 640), 1),
    ('a regular phone', const Size(400, 860), 1),
    ('a regular phone with 200% text', const Size(400, 860), 2),
  ]) {
    testWidgets('the gallery lays out on $name', (WidgetTester tester) async {
      await showGallery(tester, size, textScale: scale);
      expect(find.text('Component gallery'), findsOneWidget);
      await scrollAll(tester);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('tabs tell screen readers which one is selected', (WidgetTester tester) async {
    await showGallery(tester, const Size(400, 860));
    await tester.scrollUntilVisible(find.text('Lending'), 300, scrollable: find.byType(Scrollable).first);
    Semantics tabOf(String label) => tester.widget<Semantics>(
        find.ancestor(of: find.text(label), matching: find.byWidgetPredicate((Widget w) => w is Semantics && w.properties.selected != null)).first);
    expect(tabOf('Borrowing').properties.selected, isTrue);
    expect(tabOf('Lending').properties.selected, isFalse);
    await tester.tap(find.text('Lending'));
    await tester.pump();
    expect(tabOf('Lending').properties.selected, isTrue);
    expect(tabOf('Lending').properties.button, isTrue);
  });
}
