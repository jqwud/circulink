import 'package:flutter/material.dart';

import '../../core/theme.dart';

/// A bottom sheet with a title, for short forms (reject with a reason, rate, report a problem).
/// Sheets keep the screen behind visible, sit within thumb reach, rise with the keyboard and scroll
/// when the text is large. Close it with Navigator.pop(context, result).
Future<T?> showHiSheet<T>(BuildContext context, {required String title, required Widget Function(BuildContext sheetContext) builder}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (BuildContext ctx) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(HiSpace.gutter, 0, HiSpace.gutter, HiSpace.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Semantics(header: true, child: Text(title, style: HiText.h2)),
            const SizedBox(height: HiSpace.ms),
            builder(ctx),
          ],
        ),
      ),
    ),
  );
}
