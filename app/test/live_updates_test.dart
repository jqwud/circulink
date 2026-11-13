// Live updates while the app is open: a resident sees a new notification (the red dot) and the lists
// reload by themselves, without pulling to refresh. Nothing is redrawn when nothing changed.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:circulink/widgets/ui/pill_nav.dart';
import 'package:circulink/core/state.dart';
import 'package:circulink/core/theme.dart';
import 'package:circulink/screens/home_shell.dart';
import 'package:provider/provider.dart';

Map<String, dynamic> me(int unread) => <String, dynamic>{
      'id': 1, 'name': 'Ana Cruz', 'role': 'resident', 'unread_notifications': unread,
    };

void main() {
  late AppState app;
  late int redraws;
  setUp(() {
    app = AppState()
      ..lang = 'en'
      ..user = me(0);
    app.api.token = 'test-token';
    redraws = 0;
    app.addListener(() => redraws++);
  });
  tearDown(() => app.api.token = null);

  test('nothing new: no redraw and no list reload', () async {
    await app.liveCheck(fetch: () async => me(0));
    expect(redraws, 0);
    expect(app.version, 0);
  });

  test('a new notification: the count updates and every list reloads', () async {
    await app.liveCheck(fetch: () async => me(1));
    expect(app.unread, 1);
    expect(app.version, 1);
    expect(redraws, 1);
  });

  test('reading notifications lowers the count without reloading the lists', () async {
    app.user = me(2);
    await app.liveCheck(fetch: () async => me(0));
    expect(app.unread, 0);
    expect(app.version, 0);
    expect(redraws, 1);
  });

  test('offline for a moment: nothing changes and no error', () async {
    await app.liveCheck(fetch: () async => throw Exception('no network'));
    expect(app.unread, 0);
    expect(redraws, 0);
  });

  test('logged out: no check at all', () async {
    app.user = null;
    var asked = false;
    await app.liveCheck(fetch: () async {
      asked = true;
      return me(5);
    });
    expect(asked, isFalse);
  });

  testWidgets('the Home tab shows a red dot with the count when a notification arrives', (WidgetTester tester) async {
    await tester.pumpWidget(ChangeNotifierProvider<AppState>.value(
      value: app,
      child: MaterialApp(theme: buildTheme(), home: const HomeShell()),
    ));
    await tester.pump();
    expect(find.descendant(of: find.byType(PillNav), matching: find.text('3')), findsNothing);
    await app.liveCheck(fetch: () async => me(3));
    await tester.pump();
    expect(find.descendant(of: find.byType(PillNav), matching: find.text('3')), findsOneWidget);
    // Leaving the screen stops the checks.
    await tester.pumpWidget(const SizedBox());
  });
}
