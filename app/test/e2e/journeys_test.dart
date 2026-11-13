// End to end: the real app screens, talking over real HTTP to the real API on the TEST database
// (portal/e2e/test-server.mjs, fresh demo data). Run with `node tools/e2e.mjs`, which starts that server,
// runs this file and stops the server. A plain `flutter test` skips these, since no server is running.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:circulink/core/api.dart';
import 'package:circulink/main.dart';
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

Future<String> tokenOf(String who) async => (await call('POST', '/auth/login', body: <String, dynamic>{'email': '$who@circulink.test', 'password': 'circulink123'}))['token'] as String;

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

/// Lets the app finish what it started in the background (a refresh after a tap) before the test ends.
Future<void> settle(WidgetTester tester) async {
  for (int i = 0; i < 10; i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 100)));
    await tester.pump(const Duration(milliseconds: 100));
  }
  await tester.pump(const Duration(seconds: 30)); // past any request timeout or message timer
  await tester.pumpWidget(const SizedBox()); // close the app, so its live-update timer stops
  await tester.pump(const Duration(seconds: 30));
}

Future<void> tapAndWait(WidgetTester tester, Finder target, Finder then) async {
  await tester.ensureVisible(target);
  await tester.pump(); // draw the scrolled position before tapping
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
  await tester.pumpWidget(const CircuLinkApp());
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

/// Real letter shapes, so screens are measured as on a phone: the Nunito files the app ships (assets/fonts),
/// used for Roboto too. The Material icon font comes from the Flutter SDK when it is there; some CI machines
/// do not have it, and then icons are drawn as boxes, which changes nothing the tests look at.
Future<void> loadPhoneFonts() async {
  Future<ByteData> read(String path) async => ByteData.sublistView(await File(path).readAsBytes());
  const List<String> nunito = <String>['Regular', 'SemiBold', 'Bold', 'ExtraBold'];
  for (final String family in <String>['Nunito', 'Roboto']) {
    final FontLoader loader = FontLoader(family);
    for (final String w in nunito) {
      loader.addFont(read('assets/fonts/Nunito-$w.ttf'));
    }
    await loader.load();
  }
  final File icons = File('${Platform.environment['FLUTTER_ROOT']}/bin/cache/artifacts/material_fonts/materialicons-regular.otf');
  if (icons.existsSync()) await (FontLoader('MaterialIcons')..addFont(read(icons.path))).load();
}

void main() {
  setUpAll(() async {
    if (skip) return;
    HttpOverrides.global = null; // widget tests normally block the network; these are about the real server
    await loadPhoneFonts();
  });

  testWidgets('a resident logs in, sees how CircuLink works, and finds the hubs', (WidgetTester tester) async {
    await openApp(tester);
    await logIn(tester, 'ana@circulink.test', 'circulink123');
    await waitFor(tester, find.text('Hello, Ana!'));
    expect(find.text('How CircuLink works'), findsOneWidget);
    await tapAndWait(tester, find.text('Hubs'), find.text('Campus Green Hub'));
    expect(find.text('Barangay San Isidro MRF'), findsOneWidget);
    await settle(tester);
  }, skip: skip);

  testWidgets('a new resident signs up with a phone number and a student ID', (WidgetTester tester) async {
    await openApp(tester);
    await tapAndWait(tester, find.text('New here? Create an account'), find.widgetWithText(TextField, 'Full name'));
    final String tag = DateTime.now().millisecondsSinceEpoch.toString().substring(6);
    await tester.enterText(find.widgetWithText(TextField, 'Full name'), 'Dina Villanueva');
    await tester.enterText(find.widgetWithText(TextField, 'Email'), 'dina$tag@example.com');
    await tester.enterText(find.widgetWithText(TextField, 'Phone'), '0919$tag');
    await tester.enterText(find.widgetWithText(TextField, 'Student ID (Optional)'), 'sid-$tag');
    await tester.enterText(find.widgetWithText(TextField, 'Password'), 'goodpass1');
    final Finder agree = find.byType(Checkbox);
    await tester.ensureVisible(agree);
    await tester.pump();
    await tester.tap(agree);
    await tapAndWait(tester, find.widgetWithText(FilledButton, 'Create account'), find.text('Hello, Dina!'));
    await tapAndWait(tester, find.text('Me'), find.text('Student ID: SID-$tag'));
    await settle(tester);
  }, skip: skip);

  testWidgets('hub staff are sent to the web portal', (WidgetTester tester) async {
    await openApp(tester);
    await tester.enterText(find.widgetWithText(TextField, 'Email'), 'staff@circulink.test');
    await tester.enterText(find.widgetWithText(TextField, 'Password'), 'circulink123');
    await tapAndWait(tester, find.widgetWithText(FilledButton, 'Log in'), find.textContaining('use the web portal'));
    await settle(tester);
  }, skip: skip);

  testWidgets('a resident declares items, gets a code, and sees what staff decided', (WidgetTester tester) async {
    await openApp(tester);
    await logIn(tester, 'carlo@circulink.test', 'circulink123');
    await tapAndWait(tester, find.text('Drop-offs'), find.text('My drop-offs'));
    await tapAndWait(tester, find.widgetWithText(FilledButton, 'Declare items'), find.text('Get my drop-off code'));
    await tapAndWait(tester, find.text('Hub'), find.text('Campus Green Hub').last);
    await tapAndWait(tester, find.text('Campus Green Hub').last, find.text('Category'));
    await tapAndWait(tester, find.text('Category'), find.text('Clothes and textiles').last);
    await tester.tap(find.text('Clothes and textiles').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'What is it? (Optional)'), '3 shirts');
    await tapAndWait(tester, find.widgetWithText(FilledButton, 'Get my drop-off code'), find.text('Your drop-off code'));

    // At the hub: staff check the code in and sort the item (the portal does this; here, the API).
    final String carlo = await tester.runAsync(() => tokenOf('carlo')) as String;
    final String staff = await tester.runAsync(() => tokenOf('staff')) as String;
    final Map<String, dynamic> mine = ((await tester.runAsync(() => call('GET', '/declarations', token: carlo))) as List<dynamic>).first as Map<String, dynamic>;
    expect(find.text(mine['code'] as String), findsOneWidget);
    final Map<String, dynamic> received = await tester.runAsync(() => call('POST', '/staff/checkin', token: staff, body: <String, dynamic>{'code': mine['code']})) as Map<String, dynamic>;
    final int itemId = ((received['items'] as List<dynamic>).first as Map<String, dynamic>)['id'] as int;
    await tester.runAsync(() => call('POST', '/staff/items/$itemId/sort', token: staff, body: <String, dynamic>{'weight_kg': 2, 'outcome': 'recycle'}));

    await tester.fling(find.byType(ListView).first, const Offset(0, 500), 1500);
    await waitFor(tester, find.text('Received at the hub'));
    expect(find.text('2 kg · 10 points (pending)'), findsOneWidget);
    await settle(tester);
  }, skip: skip);
}
