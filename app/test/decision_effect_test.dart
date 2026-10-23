// Decision effects support the decision and never slow it down (design spec, sections 7 and 10).
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hiraman/widgets/ui/decision_effect.dart';

/// A screen with one button behind the effect, and a way to start an effect.
class _Stage extends StatelessWidget {
  final void Function(BuildContext) start;
  final VoidCallback onTap;
  const _Stage({required this.start, required this.onTap});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: <Widget>[
            ElevatedButton(onPressed: onTap, child: const Text('Behind')),
            Builder(builder: (BuildContext c) => TextButton(onPressed: () => start(c), child: const Text('Decide'))),
          ]),
        ),
      );
}

void main() {
  final List<String> haptics = <String>[];
  setUp(() {
    haptics.clear();
    MotionBudget.instance.reset();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (MethodCall call) async {
      if (call.method == 'HapticFeedback.vibrate') haptics.add(call.arguments as String);
      return null;
    });
  });

  test('every effect is shorter than 900 ms', () {
    for (final Decision d in Decision.values) {
      expect(effectDuration(d) <= kEffectMax, isTrue, reason: d.name);
    }
  });

  testWidgets('an effect shows, gives one haptic tick, and goes away on its own', (WidgetTester tester) async {
    bool finished = false;
    await tester.pumpWidget(MaterialApp(home: _Stage(start: (BuildContext c) => playDecision(c, Decision.approved).then((_) => finished = true), onTap: () {})));
    await tester.tap(find.text('Decide'));
    await tester.pump();
    expect(find.byIcon(Icons.check_circle), findsOneWidget);
    expect(haptics, <String>['HapticFeedbackType.lightImpact']);
    await tester.pump(effectDuration(Decision.approved) + const Duration(milliseconds: 16)); // its last frame
    await tester.pump();
    expect(find.byIcon(Icons.check_circle), findsNothing);
    expect(finished, isTrue);
  });

  testWidgets('the screen stays usable: a tap reaches the button behind and ends the effect', (WidgetTester tester) async {
    int taps = 0;
    await tester.pumpWidget(MaterialApp(home: _Stage(start: (BuildContext c) => playDecision(c, Decision.returnedGood), onTap: () => taps++)));
    await tester.tap(find.text('Decide'));
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byIcon(Icons.assignment_turned_in), findsOneWidget);
    await tester.tap(find.text('Behind'), warnIfMissed: false);
    await tester.pump();
    expect(taps, 1);
    expect(find.byIcon(Icons.assignment_turned_in), findsNothing);
  });

  testWidgets('with "Remove animations" on, nothing moves; the haptic tick still confirms', (WidgetTester tester) async {
    await tester.pumpWidget(MaterialApp(
      builder: (BuildContext c, Widget? child) => MediaQuery(data: MediaQuery.of(c).copyWith(disableAnimations: true), child: child!),
      home: _Stage(start: (BuildContext c) => playDecision(c, Decision.handover), onTap: () {}),
    ));
    await tester.tap(find.text('Decide'));
    await tester.pump();
    expect(find.byIcon(Icons.handshake), findsNothing);
    expect(haptics, hasLength(1));
  });

  testWidgets('a decline is calm: no haptic, no celebration', (WidgetTester tester) async {
    await tester.pumpWidget(MaterialApp(home: _Stage(start: (BuildContext c) => playDecision(c, Decision.declined), onTap: () {})));
    await tester.tap(find.text('Decide'));
    await tester.pump();
    expect(haptics, isEmpty);
    await tester.pump(kEffectMax);
  });

  test('a phone that drops 3 of the first 10 frames gets simple fades from then on', () {
    final List<bool> stored = <bool>[];
    MotionBudget.instance.store = stored.add;
    for (final int ms in <int>[10, 40, 12, 45, 50]) {
      MotionBudget.instance.addFrame(Duration(milliseconds: ms));
    }
    expect(MotionBudget.instance.lowEnd, isTrue);
    expect(stored, <bool>[true]);
  });

  test('a phone that keeps up stays on full effects', () {
    for (int i = 0; i < 12; i++) {
      MotionBudget.instance.addFrame(Duration(milliseconds: i.isEven ? 10 : 40));
    }
    expect(MotionBudget.instance.lowEnd, isTrue, reason: 'every other frame slow is still a slow phone');
    MotionBudget.instance.reset();
    for (int i = 0; i < 12; i++) {
      MotionBudget.instance.addFrame(const Duration(milliseconds: 12));
    }
    expect(MotionBudget.instance.lowEnd, isFalse);
  });
}
