// Short forms open as bottom sheets: a required answer is asked for, Cancel returns nothing.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hiraman/core/state.dart';
import 'package:hiraman/core/theme.dart';
import 'package:hiraman/widgets/common.dart';
import 'package:provider/provider.dart';

/// A button that opens askText and shows what came back.
Future<void> openAsk(WidgetTester tester, {required bool required}) async {
  await tester.pumpWidget(ChangeNotifierProvider<AppState>(
    create: (BuildContext c) => AppState()..lang = 'en',
    child: MaterialApp(
      theme: buildTheme(),
      home: Scaffold(
        body: Builder(builder: (BuildContext c) {
          return _Result(required: required);
        }),
      ),
    ),
  ));
  await tester.tap(find.text('Open'));
  await tester.pumpAndSettle();
}

class _Result extends StatefulWidget {
  final bool required;
  const _Result({required this.required});
  @override
  State<_Result> createState() => _ResultState();
}

class _ResultState extends State<_Result> {
  String result = 'nothing yet';
  @override
  Widget build(BuildContext context) => Column(children: <Widget>[
        TextButton(
          onPressed: () async {
            final String? r = await askText(context, title: 'What happened?', label: 'Details', confirmLabel: 'Send', required: widget.required);
            setState(() => result = r ?? 'cancelled');
          },
          child: const Text('Open'),
        ),
        Text('result: $result'),
      ]);
}

void main() {
  testWidgets('a required answer cannot be empty, and the text comes back trimmed', (WidgetTester tester) async {
    await openAsk(tester, required: true);
    expect(find.text('What happened?'), findsOneWidget);
    await tester.tap(find.text('Send'));
    await tester.pump();
    expect(find.text('Please write a few words.'), findsOneWidget);
    await tester.enterText(find.byType(TextField), '  The handle broke.  ');
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();
    expect(find.text('result: The handle broke.'), findsOneWidget);
  });

  testWidgets('Cancel closes the sheet and returns nothing', (WidgetTester tester) async {
    await openAsk(tester, required: false);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(find.text('result: cancelled'), findsOneWidget);
    expect(find.text('What happened?'), findsNothing);
  });
}
