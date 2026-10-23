// Who an item belongs to is shown on every card: Barangay (hall icon) or a neighbor (house icon), in words too.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hiraman/core/state.dart';
import 'package:hiraman/core/theme.dart';
import 'package:hiraman/widgets/ui/origin_badge.dart';
import 'package:provider/provider.dart';

Widget host(Widget child, String lang) => ChangeNotifierProvider<AppState>(
      create: (BuildContext c) => AppState()..lang = lang,
      child: MaterialApp(theme: buildTheme(), home: Scaffold(body: Center(child: child))),
    );

void main() {
  testWidgets('a Barangay item says so, with the hall icon', (WidgetTester tester) async {
    await tester.pumpWidget(host(const OriginBadge(item: <String, dynamic>{'origin': 'barangay'}), 'en'));
    expect(find.text('Barangay item'), findsOneWidget);
    expect(find.byIcon(Icons.account_balance), findsOneWidget);
    expect(find.bySemanticsLabel('Barangay item'), findsOneWidget);
  });

  testWidgets("a neighbor's item, in Filipino", (WidgetTester tester) async {
    await tester.pumpWidget(host(const OriginBadge(item: <String, dynamic>{'origin': 'kapitbahay'}), 'fil'));
    expect(find.text('Gamit ng Kapitbahay'), findsOneWidget);
    expect(find.byIcon(Icons.home), findsOneWidget);
  });

  testWidgets('older answers without origin still work from is_shelf', (WidgetTester tester) async {
    await tester.pumpWidget(host(const OriginBadge(item: <String, dynamic>{'is_shelf': true}), 'en'));
    expect(find.text('Barangay item'), findsOneWidget);
  });
}
