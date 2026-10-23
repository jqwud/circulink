// End to end: the real app screens, talking over real HTTP to the real API on the TEST database
// (portal/e2e/test-server.mjs, fresh demo data). Run with `node tools/e2e.mjs`, which starts that server,
// runs this file and stops the server. A plain `flutter test` skips these, since no server is running.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hiraman/core/api.dart';
import 'package:hiraman/core/format.dart';
import 'package:hiraman/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

final String? port = Platform.environment['E2E_PORT'];
final String server = 'http://127.0.0.1:${port ?? '4300'}';
final bool skip = port == null; // no server: node tools/e2e.mjs sets E2E_PORT

/// Calls the API outside the app, to set things up or check the result.
Future<dynamic> call(String method, String path, {String? token, Map<String, dynamic>? body}) async {
  final HttpClient client = HttpClient();
  try {
    final HttpClientRequest req = await client.openUrl(method, Uri.parse('$server/api$path'));
    if (token != null) req.headers.set('Authorization', 'Bearer $token');
    if (body != null) {
      req.headers.contentType = ContentType.json;
      req.write(jsonEncode(body));
    }
    final HttpClientResponse res = await req.close();
    final String text = await res.transform(utf8.decoder).join();
    return text.isEmpty ? null : jsonDecode(text);
  } finally {
    client.close();
  }
}

Future<String> tokenOf(String who) async => (await call('POST', '/auth/login', body: <String, dynamic>{'email': '$who@hiraman.test', 'password': 'hiraman123'}))['token'] as String;

/// Lets real network answers arrive, then draws the screen, until [finder] shows (or 20 seconds pass).
Future<void> waitFor(WidgetTester tester, Finder finder) async {
  for (int i = 0; i < 200; i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 100)));
    await tester.pump(const Duration(milliseconds: 100));
    if (finder.evaluate().isNotEmpty) {
      for (int f = 0; f < 6; f++) {
        await tester.pump(const Duration(milliseconds: 100)); // let sheets and pages finish sliding in
      }
      return;
    }
  }
  final List<String> shown = find.byType(Text).evaluate().map((Element e) => (e.widget as Text).data ?? '').where((String t) => t.isNotEmpty).toList();
  fail('Waited 20 seconds for $finder. On screen: ${shown.join(' | ')}');
}

Future<void> tapAndWait(WidgetTester tester, Finder target, Finder then) async {
  await tester.ensureVisible(target);
  await tester.tap(target);
  await waitFor(tester, then);
}

/// Opens the app in English on the test server, logged out, past the intro.
Future<void> openApp(WidgetTester tester) async {
  SharedPreferences.setMockInitialValues(<String, Object>{'lang': 'en', 'seen_onboarding': true, 'server': server});
  FlutterSecureStorage.setMockInitialValues(<String, String>{});
  Api.instance.token = null;
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(const HiramanApp());
  await waitFor(tester, find.widgetWithText(FilledButton, 'Log in'));
}

Future<void> logIn(WidgetTester tester, String email, String password) async {
  await tester.enterText(find.widgetWithText(TextField, 'Email'), email);
  await tester.enterText(find.widgetWithText(TextField, 'Password'), password);
  final Finder agree = find.widgetWithText(FilledButton, 'I have read it and I agree');
  final Finder notice = find.text('Before you continue');
  await tapAndWait(tester, find.widgetWithText(FilledButton, 'Log in'), find.byWidgetPredicate((Widget w) => w is NavigationBar || (w is Text && w.data == 'Before you continue')));
  // Demo accounts have not yet agreed to the current privacy notice, so the app asks once, as for anyone.
  if (notice.evaluate().isNotEmpty) {
    await tester.scrollUntilVisible(agree, 400, scrollable: find.byType(Scrollable).first);
    await tapAndWait(tester, agree, find.byType(NavigationBar));
  }
}

String usDate(DateTime d) => '${d.month.toString().padLeft(2, '0')}/${d.day.toString().padLeft(2, '0')}/${d.year}';

/// Real letter shapes, so screens are measured as on a phone. The app asks for Nunito, which it does not ship,
/// so Android shows Roboto; the test does the same, with fonts from the Flutter SDK.
Future<void> loadPhoneFonts() async {
  final String fonts = '${Platform.environment['FLUTTER_ROOT']}/bin/cache/artifacts/material_fonts';
  Future<ByteData> read(String name) async => ByteData.sublistView(await File('$fonts/$name').readAsBytes());
  for (final String family in <String>['Nunito', 'Roboto']) {
    final FontLoader loader = FontLoader(family);
    for (final String w in <String>['regular', 'medium', 'bold', 'black']) {
      loader.addFont(read('roboto-$w.ttf'));
    }
    await loader.load();
  }
  await (FontLoader('MaterialIcons')..addFont(read('materialicons-regular.otf'))).load();
}

void main() {
  setUpAll(() async {
    if (skip) return;
    HttpOverrides.global = null; // widget tests normally block the network; these are about the real server
    await loadPhoneFonts();
  });

  testWidgets('a resident borrows an item, cancels, and gets the credit back', (WidgetTester tester) async {
    final String carlo = await tester.runAsync(() => tokenOf('carlo')) as String;
    final int before = (await tester.runAsync(() => call('GET', '/me', token: carlo)))['credits'] as int;

    await openApp(tester);
    await logIn(tester, 'carlo@hiraman.test', 'hiraman123');
    await tapAndWait(tester, find.text('Browse'), find.byType(TextField));
    await tester.enterText(find.byType(TextField).first, 'Cooler');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await waitFor(tester, find.text('Cooler box'));
    await tapAndWait(tester, find.text('Cooler box'), find.textContaining('Borrow ·'));
    await tapAndWait(tester, find.textContaining('Borrow ·'), find.text('Choose dates'));

    // The date picker, typed in rather than tapped on the calendar.
    await tapAndWait(tester, find.text('Choose dates'), find.byIcon(Icons.edit_outlined));
    await tapAndWait(tester, find.byIcon(Icons.edit_outlined), find.byType(TextField));
    final DateTime today = phToday();
    final int fields = find.byType(TextField).evaluate().length; // the picker's two boxes are the last ones
    await tester.enterText(find.byType(TextField).at(fields - 2), usDate(today));
    await tester.enterText(find.byType(TextField).at(fields - 1), usDate(today.add(const Duration(days: 1))));
    await tapAndWait(tester, find.text('OK').last, find.textContaining('(2 days)'));
    // A quick-borrow item is approved at once.
    await tapAndWait(tester, find.text('Send request'), find.text('You got it!'));
    expect((await tester.runAsync(() => call('GET', '/me', token: carlo)))['credits'], before - 1, reason: 'one credit held');

    await tapAndWait(tester, find.widgetWithText(TextButton, 'OK'), find.text('Credits on hold: 1'));
    await tester.scrollUntilVisible(find.text('Cancel request'), 300, scrollable: find.byType(Scrollable).last);
    await tapAndWait(tester, find.text('Cancel request'), find.text('Yes, cancel'));
    await tapAndWait(tester, find.text('Yes, cancel'), find.text('Cancelled'));
    expect((await tester.runAsync(() => call('GET', '/me', token: carlo)))['credits'], before, reason: 'credit returned');
  }, skip: skip);

  testWidgets('a newcomer signs up and is asked to verify their account', (WidgetTester tester) async {
    await openApp(tester);
    await tapAndWait(tester, find.text('New here? Create an account'), find.text('Create account'));
    // The login screen stays underneath, so its fields are found too; the sign-up form is the last.
    await tester.enterText(find.widgetWithText(TextField, 'Full name'), 'Liza Mercado');
    await tester.enterText(find.widgetWithText(TextField, 'Email').last, 'liza@hiraman.test');
    await tester.enterText(find.widgetWithText(TextField, 'Password').last, 'goodpass1');
    await tester.ensureVisible(find.byType(CheckboxListTile));
    await tester.tap(find.byType(Checkbox));
    await tapAndWait(tester, find.widgetWithText(FilledButton, 'Create account'), find.text('Verify your account'));

    final String admin = await tester.runAsync(() => tokenOf('admin')) as String;
    final List<dynamic> residents = await tester.runAsync(() => call('GET', '/admin/users?q=liza', token: admin)) as List<dynamic>;
    expect(residents.single['verification_status'], 'unverified');
  }, skip: skip);
}
