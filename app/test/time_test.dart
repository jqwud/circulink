// The app counts days in Philippine time, like the server, whatever time zone the phone is set to.
import 'package:flutter_test/flutter_test.dart';
import 'package:hiraman/core/format.dart';

void main() {
  test('just before and just after midnight in Manila', () {
    expect(ymd(phToday(DateTime.utc(2026, 10, 23, 15, 59, 59))), '2026-10-23');
    expect(ymd(phToday(DateTime.utc(2026, 10, 23, 16))), '2026-10-24');
  });

  test('a phone set to another time zone still gets the Manila date', () {
    // 2026-10-24 00:30 in Manila is still 2026-10-23 in Los Angeles; the app must say the 24th.
    final DateTime losAngelesEvening = DateTime.utc(2026, 10, 23, 16, 30).toLocal();
    expect(ymd(phToday(losAngelesEvening)), '2026-10-24');
  });
}
