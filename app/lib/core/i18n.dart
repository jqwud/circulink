import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import 'state.dart';

/// Short helpers for screens.
///   context.t('Text')   inside build()          (the screen redraws when the language changes)
///   context.tx('Text')  inside onPressed etc.   (no listening)
extension HiContext on BuildContext {
  String t(String s) => Provider.of<AppState>(this).tr(s);
  String tx(String s) => Provider.of<AppState>(this, listen: false).tr(s);
  /// For a sentence with numbers decided by the server, like "up to {n} days" with n = 14.
  String tv(String s, Map<String, Object> values) => _fill(t(s), values);
  String txv(String s, Map<String, Object> values) => _fill(tx(s), values);
  AppState get app => Provider.of<AppState>(this, listen: false);
  String get lang => Provider.of<AppState>(this).lang;
}

String _fill(String text, Map<String, Object> values) {
  String out = text;
  values.forEach((String k, Object v) => out = out.replaceAll('{$k}', '$v'));
  return out;
}
