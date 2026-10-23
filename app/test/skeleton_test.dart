// The loading placeholder must work inside a scrolling page too (the Me tab's badges load inside one).
// Found by the end-to-end tests in batch 25: before the fix, this layout failed while the badges loaded.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hiraman/core/state.dart';
import 'package:hiraman/core/theme.dart';
import 'package:hiraman/widgets/ui/skeleton.dart';
import 'package:provider/provider.dart';

void main() {
  testWidgets('the loading placeholder fits inside a scrolling page', (WidgetTester tester) async {
    await tester.pumpWidget(ChangeNotifierProvider<AppState>(
      create: (BuildContext c) => AppState()..lang = 'en',
      child: MaterialApp(
        theme: buildTheme(),
        home: Scaffold(body: ListView(children: const <Widget>[Text('Above'), SkeletonList(count: 2), Text('Below')])),
      ),
    ));
    expect(tester.takeException(), isNull);
    expect(find.text('Below'), findsOneWidget);
  });
}
