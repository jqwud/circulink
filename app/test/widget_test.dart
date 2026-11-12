import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:circulink/core/strings_fil.dart';
import 'package:circulink/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('first launch shows the CircuLink intro', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{'lang': 'en'});
    FlutterSecureStorage.setMockInitialValues(<String, String>{});
    await tester.pumpWidget(const CircuLinkApp());
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(seconds: 4));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Keep things in the loop'), findsOneWidget);
  });

  test('Filipino dictionary has no empty translations', () {
    kFil.forEach((String en, String fil) {
      expect(fil.trim().isNotEmpty, true, reason: 'Empty translation for "$en"');
    });
  });
}
