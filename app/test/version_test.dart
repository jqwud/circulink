// The version shown on the Me tab must be the one the build gets from pubspec.yaml (bump both together).
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hiraman/core/constants.dart';

void main() {
  test('kAppVersion matches the version in pubspec.yaml', () {
    final String line = File('pubspec.yaml').readAsLinesSync().firstWhere((String l) => l.startsWith('version:'));
    expect(kAppVersion, line.substring('version:'.length).trim());
  });
}
