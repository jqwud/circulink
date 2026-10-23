import 'package:flutter/material.dart';

import '../core/format.dart';
import '../core/i18n.dart';

/// Borrow dates: from today, at most [maxDays] days long, never across a booked day. Booked days are greyed
/// out, so the picker never offers dates the server would refuse. [booked] is the item's `booked_ranges`.
Future<DateTimeRange?> pickBorrowDates(BuildContext context, {required int maxDays, List<Map<String, dynamic>> booked = const <Map<String, dynamic>>[], DateTimeRange? initial}) {
  final DateTime first = phToday();
  final List<DateTimeRange> taken = <DateTimeRange>[
    for (final Map<String, dynamic> b in booked)
      if (parseYmd(str(b['start_date'])) != null && parseYmd(str(b['end_date'])) != null)
        DateTimeRange(start: parseYmd(str(b['start_date']))!, end: parseYmd(str(b['end_date']))!),
  ];
  bool isTaken(DateTime d) => taken.any((DateTimeRange r) => !d.isBefore(r.start) && !d.isAfter(r.end));
  bool freeBetween(DateTime a, DateTime b) {
    for (DateTime d = a; !d.isAfter(b); d = DateTime(d.year, d.month, d.day + 1)) {
      if (isTaken(d)) return false;
    }
    return true;
  }

  // An earlier choice that is no longer possible is not shown as the starting range.
  final DateTimeRange? start = initial != null && !initial.start.isBefore(first) && daysInclusive(initial.start, initial.end) <= maxDays && freeBetween(initial.start, initial.end) ? initial : null;
  return showDateRangePicker(
    context: context,
    firstDate: first,
    lastDate: first.add(const Duration(days: 90)),
    initialDateRange: start,
    helpText: context.txv('Choose borrow dates (up to {n} days)', <String, Object>{'n': maxDays}),
    selectableDayPredicate: (DateTime day, DateTime? from, DateTime? to) {
      if (isTaken(day)) return false;
      if (from != null && to == null && !day.isBefore(from)) {
        return daysInclusive(from, day) <= maxDays && freeBetween(from, day);
      }
      return true;
    },
  );
}
