// Notifications are written in the reader's language from their type and values, with friendly dates.
import 'package:flutter_test/flutter_test.dart';
import 'package:hiraman/core/notification_text.dart';
import 'package:hiraman/core/strings_fil.dart';

String fil(String s) => kFil[s] ?? s;
String en(String s) => s;

Map<String, dynamic> notice(String type, Map<String, dynamic> params) =>
    <String, dynamic>{'type': type, 'title': 'English title', 'body': 'English body', 'params': params};

void main() {
  test('a new request reads in Filipino with Filipino month names', () {
    final ({String title, String body}) r = notificationText(
        notice('request_new', <String, dynamic>{'name': 'Ana', 'item': 'Ladder', 'start': '2026-10-21', 'end': '2026-10-23'}), fil, 'fil');
    expect(r.title, 'Ana ay gustong humiram ng Ladder');
    expect(r.body, 'Okt 21, 2026 - Okt 23, 2026. Buksan ang Mga Hiling para aprubahan o tanggihan.');
  });

  test('the same notice in English', () {
    final ({String title, String body}) r = notificationText(
        notice('request_new', <String, dynamic>{'name': 'Ana', 'item': 'Ladder', 'start': '2026-10-21', 'end': '2026-10-23'}), en, 'en');
    expect(r.title, 'Ana wants to borrow Ladder');
    expect(r.body, 'Oct 21, 2026 - Oct 23, 2026. Open Requests to approve or reject.');
  });

  test('older notices without values, and announcements, keep the text they were sent with', () {
    final ({String title, String body}) old = notificationText(<String, dynamic>{'type': 'handover', 'title': 'You have Ladder', 'body': 'Please return it by 2026-10-23.'}, fil, 'fil');
    expect(old.title, 'You have Ladder');
    final ({String title, String body}) news = notificationText(<String, dynamic>{'type': 'announcement', 'title': 'Clean-up drive', 'body': 'Saturday 7 AM'}, fil, 'fil');
    expect(news.title, 'Clean-up drive');
  });

  test('every kind of notice fills all its blanks, in both languages', () {
    const Map<String, dynamic> p = <String, dynamic>{
      'name': 'Ana', 'item': 'Ladder', 'start': '2026-10-21', 'end': '2026-10-23', 'days': 2, 'n': 1, 'credits': '+1',
      'wanted': 'Calculator', 'note': 'It wobbles', 'reason': 'Blurry', 'outcome': 'accident', 'preview': 'Hi', 'why': 'no_answer', 'until': '2026-11-22',
    };
    const List<String> types = <String>[
      'request_new', 'request_auto', 'request_staff', 'request_approved', 'request_rejected', 'request_cancelled', 'request_dates_changed',
      'request_expired', 'handover', 'due_tomorrow', 'due_today', 'overdue', 'owner_overdue', 'checkin_missed', 'checkin_alert',
      'checkin_problem', 'borrower_returned', 'credit_earned', 'credit_capped', 'late_return', 'return_confirmed', 'dispute',
      'dispute_settled', 'verified', 'verification_rejected', 'item_removed', 'report_resolved', 'wanted_offer', 'message',
      'request_cancelled_by_staff', 'item_hidden', 'item_shown', 'item_flagged', 'request_extended', 'shelf_paused',
    ];
    for (final String type in types) {
      for (final (String Function(String), String) lang in <(String Function(String), String)>[(fil, 'fil'), (en, 'en')]) {
        final ({String title, String body}) r = notificationText(notice(type, Map<String, dynamic>.from(p)), lang.$1, lang.$2);
        expect(r.title, isNot(contains('{')), reason: '$type title (${lang.$2})');
        expect(r.body, isNot(contains('{')), reason: '$type body (${lang.$2})');
        expect(r.title, isNot('English title'), reason: '$type has its own sentence');
      }
    }
  });

  test('a message notice shows the quick reply in the language of the reader', () {
    final Map<String, dynamic> m = notice('message', <String, dynamic>{'name': 'Ana', 'item': 'Ladder', 'preview': "I'm on my way.", 'preview_fil': 'Papunta na po ako.'});
    expect(notificationText(m, fil, 'fil').body, 'Papunta na po ako.');
    expect(notificationText(m, en, 'en').body, "I'm on my way.");
  });

  test('a Barangay pause says until when, as a date', () {
    final ({String title, String body}) r = notificationText(notice('shelf_paused', <String, dynamic>{'n': 2, 'until': '2026-11-22'}), en, 'en');
    expect(r.body, 'After late returns, you can borrow Barangay items again after Nov 22, 2026.');
  });
}
