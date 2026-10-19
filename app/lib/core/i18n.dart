import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import 'state.dart';

/// Short helpers for screens.
///   context.t('Text')   inside build()          (the screen redraws when the language changes)
///   context.tx('Text')  inside onPressed etc.   (no listening)
extension HiContext on BuildContext {
  String t(String s) => Provider.of<AppState>(this).tr(s);
  String tx(String s) => Provider.of<AppState>(this, listen: false).tr(s);
  AppState get app => Provider.of<AppState>(this, listen: false);
  String get lang => Provider.of<AppState>(this).lang;
}
