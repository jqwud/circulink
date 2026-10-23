// Simple mode: four big buttons that fit a small phone even with the largest text, and nothing overflows.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hiraman/core/state.dart';
import 'package:hiraman/core/theme.dart';
import 'package:hiraman/screens/simple_home.dart';
import 'package:provider/provider.dart';

Widget host(double systemText) => ChangeNotifierProvider<AppState>(
      create: (BuildContext c) => AppState()
        ..lang = 'en'
        ..user = <String, dynamic>{'name': 'Lola Remedios Santos', 'credits': 3, 'simple_mode': true, 'unread_notifications': 2},
      child: MaterialApp(
        theme: buildTheme(simple: true),
        builder: (BuildContext context, Widget? child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(systemText)),
          child: SimpleModeFrame(on: true, child: child!),
        ),
        home: const SimpleHome(),
      ),
    );

void main() {
  for (final double systemText in <double>[1.0, 2.0]) {
    testWidgets('fits a 320 x 640 phone with the phone text at ${systemText}x', (WidgetTester tester) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(host(systemText));
      await tester.pump();
      expect(tester.takeException(), isNull);
      expect(find.text('Hello, Lola!'), findsOneWidget);
      // A small phone scrolls the list up and down (no sideways swipes); every button is reachable and whole.
      for (final String label in <String>['Borrow', 'My loans', 'Give', 'Help', 'Notifications (2)']) {
        await tester.scrollUntilVisible(find.text(label), 100, scrollable: find.byType(Scrollable).first);
        expect(find.text(label), findsOneWidget);
        expect(tester.takeException(), isNull);
      }
    });
  }

  testWidgets('text is 1.3 times larger, and animations are off', (WidgetTester tester) async {
    late MediaQueryData seen;
    await tester.pumpWidget(MaterialApp(
      home: SimpleModeFrame(on: true, child: Builder(builder: (BuildContext c) {
        seen = MediaQuery.of(c);
        return const SizedBox();
      })),
    ));
    expect(seen.textScaler.scale(10), closeTo(13, 0.001));
    expect(seen.disableAnimations, isTrue);
  });
}
