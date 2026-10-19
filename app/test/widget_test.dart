import 'package:flutter_test/flutter_test.dart';
import 'package:hiraman/core/strings_fil.dart';
import 'package:hiraman/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('first launch shows the Pawsa intro', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{'lang': 'en'});
    await tester.pumpWidget(const HiramanApp());
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Borrow what you need'), findsOneWidget);
  });

  test('Filipino dictionary has no empty translations', () {
    kFil.forEach((String en, String fil) {
      expect(fil.trim().isNotEmpty, true, reason: 'Empty translation for "$en"');
    });
  });
}
