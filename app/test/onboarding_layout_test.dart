// Onboarding must fit small phones and phones held sideways: no overflow, and the title on screen.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hiraman/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> showOnboarding(WidgetTester tester, Size size) async {
  SharedPreferences.setMockInitialValues(<String, Object>{'lang': 'fil'});
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(const HiramanApp());
  await tester.pump(const Duration(milliseconds: 300));
  await tester.pump(const Duration(seconds: 4)); // past the splash
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  const String title = 'Humiram ng kailangan mo';

  for (final (String name, Size size) in <(String, Size)>[
    ('small phone 320 x 568', const Size(320, 568)),
    ('phone held sideways 800 x 380', const Size(800, 380)),
    ('regular phone 400 x 860', const Size(400, 860)),
  ]) {
    testWidgets('onboarding fits a $name', (WidgetTester tester) async {
      await showOnboarding(tester, size);
      expect(tester.takeException(), isNull, reason: 'no layout overflow');
      expect(find.text(title), findsOneWidget);
      final Rect r = tester.getRect(find.text(title));
      expect(r.top >= 0 && r.bottom <= size.height, isTrue, reason: 'the title is on screen ($r)');
    });
  }
}
