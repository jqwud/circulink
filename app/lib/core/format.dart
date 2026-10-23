const List<String> _monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const List<String> _monthsFil = ['Ene', 'Peb', 'Mar', 'Abr', 'May', 'Hun', 'Hul', 'Ago', 'Set', 'Okt', 'Nob', 'Dis'];

/// 2026-10-19 (the format the API uses).
String ymd(DateTime d) {
  final String y = d.year.toString().padLeft(4, '0');
  final String m = d.month.toString().padLeft(2, '0');
  final String day = d.day.toString().padLeft(2, '0');
  return '$y-$m-$day';
}

/// Today in the Philippines (UTC+8, no daylight saving), whatever time zone the phone is set to.
/// The server counts days in Philippine time too, so both agree near midnight.
DateTime phToday([DateTime? now]) {
  final DateTime ph = (now ?? DateTime.now()).toUtc().add(const Duration(hours: 8));
  return DateTime(ph.year, ph.month, ph.day);
}

DateTime? parseYmd(String? s) {
  if (s == null || s.length < 10) return null;
  return DateTime.tryParse(s.substring(0, 10));
}

String fmtDate(String? s, String lang) {
  final DateTime? d = parseYmd(s);
  if (d == null) return s ?? '';
  final List<String> months = lang == 'fil' ? _monthsFil : _monthsEn;
  return '${months[d.month - 1]} ${d.day}, ${d.year}';
}

String fmtRange(String? a, String? b, String lang) {
  if (a == b) return fmtDate(a, lang);
  return '${fmtDate(a, lang)} - ${fmtDate(b, lang)}';
}

int daysInclusive(DateTime a, DateTime b) => b.difference(a).inDays + 1;

/// Small helpers for reading JSON safely.
String str(dynamic v, [String fallback = '']) => v == null ? fallback : v.toString();
int intOf(dynamic v, [int fallback = 0]) => v is int ? v : (v is num ? v.toInt() : (int.tryParse(str(v)) ?? fallback));
bool boolOf(dynamic v) => v == true || v == 1;
Map<String, dynamic> mapOf(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
List<Map<String, dynamic>> listOf(dynamic v) =>
    v is List ? v.map((e) => Map<String, dynamic>.from(e as Map)).toList() : <Map<String, dynamic>>[];
