import 'format.dart';

/// The title and body of a notification in the reader's language.
///
/// The server stores the notification's type and its values (`params`); this writes the sentence from them.
/// Types without a sentence here (and rows without params) keep the server's own title and body.
/// Sentences for drop-offs, points and flags are added with those features (build steps 3 to 5).
/// [tr] translates an English sentence (AppState.tr).
({String title, String body}) notificationText(Map<String, dynamic> n, String Function(String) tr, String lang) {
  final Map<String, dynamic> p = mapOf(n['params']);
  final String fallbackTitle = str(n['title']);
  final String fallbackBody = str(n['body']);
  if (p.isEmpty) return (title: fallbackTitle, body: fallbackBody);

  String fill(String english) {
    String out = tr(english);
    p.forEach((String k, dynamic v) => out = out.replaceAll('{$k}', str(v)));
    out = out.replaceAll('{date}', fmtDate(str(p['date']), lang));
    return out;
  }

  switch (str(n['type'])) {
    case 'welcome':
      return (title: fill('Welcome to CircuLink!'), body: fill('Bring items you no longer need to a hub near you.'));
    default:
      return (title: fallbackTitle, body: fallbackBody);
  }
}
