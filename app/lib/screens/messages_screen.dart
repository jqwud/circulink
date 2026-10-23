import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

/// The thread of one request. Residents talk with quick replies chosen for the request's situation
/// (Hiraman 2.0: no free text between neighbors); anything else goes to "My situation is not listed",
/// a concern only barangay staff read. Staff messages show as written.
class MessagesScreen extends StatefulWidget {
  final int requestId;
  final String title;

  /// A donation claim's thread instead of a borrow request's (then [requestId] is not used).
  final int? claimId;

  /// What "My situation is not listed" reports: the request, or (for a claim) the item.
  final int? concernItemId;
  const MessagesScreen({super.key, required this.requestId, required this.title, this.claimId, this.concernItemId});

  String get threadPath => claimId != null ? '/donations/claims/$claimId/messages' : '/requests/$requestId/messages';

  @override
  State<MessagesScreen> createState() => _MessagesScreenState();
}

/// Section names of the phrase list, in the order a loan goes.
const Map<String, String> _situationNames = <String, String>{
  'before': 'Before borrowing',
  'pickup': 'Before pickup',
  'during': 'During the loan',
  'return': 'Return',
  'problem': 'Problem or damage',
  'thanks': 'Thanks',
  'donation': 'Free item pickup',
  'donation_thanks': 'Thanks',
};

class _MessagesScreenState extends State<MessagesScreen> {
  final TextEditingController _text = TextEditingController();
  int _reloadTick = 0;
  bool _sending = false;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _post(Map<String, dynamic> body) async {
    if (_sending) return;
    setState(() => _sending = true);
    try {
      await context.app.api.post(widget.threadPath, body);
      _text.clear();
      if (mounted) setState(() => _reloadTick++);
    } catch (e) {
      if (mounted) showMessage(context, context.app.errorText(e), bad: true);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  /// Sends a phrase, first asking for its one value (a date, a time, a place...) with a picker.
  Future<void> _sendPhrase(Map<String, dynamic> phrase) async {
    final String? slot = await _pickSlot(str(phrase['slot']));
    if (slot == null && str(phrase['slot']).isNotEmpty) return;
    await _post(<String, dynamic>{'phrase_id': phrase['id'], if (slot != null) 'slot': slot});
  }

  Future<String?> _pickSlot(String kind) async {
    switch (kind) {
      case '':
        return null;
      case 'date':
        return _pickDate();
      case 'datetime':
        final String? d = await _pickDate();
        if (d == null || !mounted) return null;
        final String? t = await _choose<String>(context.tx('What time?'), <(String, String)>[
          for (int h = 6; h <= 21; h++)
            for (final int m in <int>[0, 30]) ('${h.toString().padLeft(2, '0')}:${m.toString().padLeft(2, '0')}', _clock(h, m)),
        ]);
        return t == null ? null : '$d $t';
      case 'point':
        return _choose<String>(context.tx('Where?'), <(String, String)>[
          for (final Map<String, dynamic> p in context.app.pickupPoints) ('${intOf(p['id'])}', str(p['name'])),
        ]);
      case 'condition':
        return _choose<String>(context.tx('Condition'), <(String, String)>[
          ('new', context.tx('New')), ('good', context.tx('Good')), ('fair', context.tx('Fair')), ('worn', context.tx('Well used')),
        ]);
      case 'number':
        return _choose<String>(context.tx('How many days?'), <(String, String)>[for (int n = 1; n <= 5; n++) ('$n', '$n')]);
      case 'minutes':
        return _choose<String>(context.tx('How late?'), <(String, String)>[for (int n = 1; n <= 5; n++) ('$n', '${n * 10} min')]);
      default:
        return null;
    }
  }

  Future<String?> _pickDate() async {
    final DateTime today = phToday();
    final DateTime? d = await showDatePicker(context: context, firstDate: today, lastDate: today.add(const Duration(days: 90)), initialDate: today);
    return d == null ? null : ymd(d);
  }

  static String _clock(int h, int m) => '${((h + 11) % 12) + 1}:${m.toString().padLeft(2, '0')} ${h < 12 ? 'AM' : 'PM'}';

  /// A list of big choices in a sheet. Returns the chosen value, or null when closed.
  Future<T?> _choose<T>(String title, List<(T, String)> options) {
    return showHiSheet<T>(context, title: title, builder: (BuildContext sheet) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          for (final (T value, String label) in options)
            Padding(
              padding: const EdgeInsets.only(bottom: HiSpace.sm),
              child: SoftButton(label: label, onPressed: () => Navigator.pop(sheet, value)),
            ),
        ],
      );
    });
  }

  Future<void> _openPhrases(List<Map<String, dynamic>> phrases) async {
    final Map<String, dynamic>? chosen = await showHiSheet<Map<String, dynamic>>(context, title: context.tx('Choose a message'), builder: (BuildContext sheet) {
      final String lang = sheet.lang;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          for (final String situation in _situationNames.keys)
            if (phrases.any((Map<String, dynamic> p) => p['situation'] == situation)) ...<Widget>[
              SectionTitle(sheet.t(_situationNames[situation]!)),
              for (final Map<String, dynamic> p in phrases.where((Map<String, dynamic> p) => p['situation'] == situation))
                Padding(
                  padding: const EdgeInsets.only(bottom: HiSpace.sm),
                  child: _PhraseButton(text: _template(p, lang), onPressed: () => Navigator.pop(sheet, p)),
                ),
            ],
        ],
      );
    });
    if (chosen != null && mounted) await _sendPhrase(chosen);
  }

  /// A phrase as listed before its value is picked: "{slot}" becomes "...".
  static String _template(Map<String, dynamic> p, String lang) => str(p[lang == 'fil' ? 'fil' : 'en']).replaceAll('{slot}', '…');

  Future<void> _reportConcern() async {
    final bool? sent = await showHiSheet<bool>(context, title: context.tx('My situation is not listed'), builder: (BuildContext sheet) {
      return _ConcernForm(targetType: widget.claimId != null ? 'item' : 'request', targetId: widget.claimId != null ? (widget.concernItemId ?? 0) : widget.requestId);
    });
    if (sent == true && mounted) showMessage(context, context.tx('Sent to barangay staff. They will answer within 1 working day.'));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: hiAppBar(context.t('Messages')),
      body: AsyncView<Map<String, dynamic>>(
        refreshKey: _reloadTick,
        loader: () async => mapOf(await context.app.api.get(widget.threadPath)),
        builder: (BuildContext ctx, Map<String, dynamic> data, Future<void> Function() reload) {
          final List<Map<String, dynamic>> messages = listOf(data['messages']);
          final List<Map<String, dynamic>> phrases = listOf(data['phrases']);
          final bool open = boolOf(data['open']);
          final bool canWriteText = boolOf(data['can_write_text']);
          final Map<String, Map<String, dynamic>> byId = <String, Map<String, dynamic>>{for (final Map<String, dynamic> p in phrases) str(p['id']): p};
          // Quick answers to the last message, when it asked something (for example "Yes, see you then").
          final List<Map<String, dynamic>> replies = messages.isEmpty
              ? <Map<String, dynamic>>[]
              : (messages.last['replies'] is List ? messages.last['replies'] as List<dynamic> : <dynamic>[])
                  .map((dynamic id) => byId[str(id)])
                  .whereType<Map<String, dynamic>>()
                  .toList();
          return Column(
            children: <Widget>[
              Expanded(
                child: messages.isEmpty
                    ? ListView(children: <Widget>[
                        const SizedBox(height: 40),
                        EmptyState(message: ctx.t('No messages yet. Choose a message to agree on the pickup.')),
                      ])
                    : ListView.builder(
                        reverse: true,
                        padding: const EdgeInsets.all(16),
                        itemCount: messages.length,
                        itemBuilder: (BuildContext c, int i) => _Bubble(message: messages[messages.length - 1 - i]),
                      ),
              ),
              if (!open)
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(ctx.t('This conversation is closed.'), style: const TextStyle(color: HiColors.muted)),
                )
              else
                SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(12, 6, 12, 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: <Widget>[
                        if (replies.isNotEmpty) ...<Widget>[
                          for (final Map<String, dynamic> p in replies)
                            Padding(
                              padding: const EdgeInsets.only(bottom: HiSpace.sm),
                              child: _PhraseButton(text: _template(p, ctx.lang), quick: true, onPressed: _sending ? null : () => _sendPhrase(p)),
                            ),
                        ],
                        if (canWriteText) _textBox(ctx),
                        if (phrases.isNotEmpty)
                          PrimaryButton(
                            label: ctx.t('Choose a message'),
                            icon: Icons.chat_bubble_outline,
                            busy: _sending,
                            onPressed: () => _openPhrases(phrases),
                          ),
                        if (!canWriteText) ...<Widget>[
                          const SizedBox(height: HiSpace.sm),
                          SoftButton(label: ctx.t('My situation is not listed'), icon: Icons.support_agent, onPressed: _reportConcern),
                        ],
                      ],
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  /// Free text, for barangay staff only (the server refuses it from residents).
  Widget _textBox(BuildContext ctx) {
    return Row(children: <Widget>[
      Expanded(
        child: TextField(
          controller: _text,
          minLines: 1,
          maxLines: 4,
          maxLength: 500,
          decoration: InputDecoration(hintText: ctx.t('Write a message'), counterText: ''),
        ),
      ),
      IconButton.filled(
        tooltip: ctx.t('Send'),
        onPressed: _sending ? null : () => _text.text.trim().isEmpty ? null : _post(<String, dynamic>{'body': _text.text.trim()}),
        icon: const Icon(Icons.send),
      ),
    ]);
  }
}

/// One quick reply, as a big button that wraps long text (at least 48 dp tall).
class _PhraseButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  final bool quick;
  const _PhraseButton({required this.text, required this.onPressed, this.quick = false});

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        alignment: Alignment.centerLeft,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        backgroundColor: quick ? HiColors.primarySoft : Colors.white,
        foregroundColor: HiColors.ink,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      onPressed: onPressed,
      child: Text(text, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
    );
  }
}

/// "My situation is not listed": a topic, an optional note, and a reminder that only staff read it.
class _ConcernForm extends StatefulWidget {
  final String targetType;
  final int targetId;
  const _ConcernForm({required this.targetType, required this.targetId});

  @override
  State<_ConcernForm> createState() => _ConcernFormState();
}

class _ConcernFormState extends State<_ConcernForm> {
  static const Map<String, String> _topics = <String, String>{
    'safety': 'I feel unsafe',
    'item_problem': 'Problem with the item',
    'money_asked': 'Money was asked from me',
    'harassment': 'Rude or harassing behavior',
    'other': 'Something else',
  };
  final TextEditingController _note = TextEditingController();
  String _topic = 'other';
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.app.api.post('/reports', <String, dynamic>{
        'target_type': widget.targetType,
        'target_id': widget.targetId,
        'reason': _topic,
        if (_note.text.trim().isNotEmpty) 'details': _note.text.trim(),
      });
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => _error = context.app.errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final String hall = context.app.hallPhone;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text(context.t('Tell the barangay what happened. Only barangay staff read this, not the other person.'), style: const TextStyle(color: HiColors.muted)),
        const SizedBox(height: HiSpace.ms),
        RadioGroup<String>(
          groupValue: _topic,
          onChanged: (String? v) => setState(() => _topic = v ?? _topic),
          child: Column(children: <Widget>[
            for (final MapEntry<String, String> t in _topics.entries)
              RadioListTile<String>(value: t.key, title: Text(context.t(t.value)), contentPadding: EdgeInsets.zero),
          ]),
        ),
        TextField(
          controller: _note,
          minLines: 2,
          maxLines: 5,
          maxLength: 500,
          decoration: InputDecoration(labelText: context.t('What happened? (optional)')),
        ),
        if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(_error!, style: const TextStyle(color: HiColors.danger))),
        PrimaryButton(label: context.t('Send to barangay staff'), busy: _busy, onPressed: _send),
        const SizedBox(height: HiSpace.md),
        Text(context.t('In an emergency, call 911.'), style: const TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: HiSpace.sm),
        Row(children: <Widget>[
          Expanded(child: SoftButton(label: context.t('Call 911'), icon: Icons.emergency, onPressed: () => launchUrl(Uri.parse('tel:911')))),
          if (hall.isNotEmpty) ...<Widget>[
            const SizedBox(width: HiSpace.sm),
            Expanded(child: SoftButton(label: context.t('Call the hall'), icon: Icons.call, onPressed: () => launchUrl(Uri.parse('tel:$hall')))),
          ],
        ]),
      ],
    );
  }
}

class _Bubble extends StatelessWidget {
  final Map<String, dynamic> message;
  const _Bubble({required this.message});

  @override
  Widget build(BuildContext context) {
    final bool mine = boolOf(message['mine']);
    final bool staff = boolOf(message['staff']);
    final String from = staff ? context.t('Barangay staff') : str(message['from']);
    final String text = str(message[context.lang == 'fil' ? 'fil' : 'en'], str(message['body']));
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 320),
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: mine ? HiColors.primarySoft : (staff ? HiColors.infoSoft : Colors.white),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: mine ? HiColors.primarySoft : HiColors.line),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            if (!mine) Text(from, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: staff ? HiColors.info : HiColors.accent)),
            Text(text, style: const TextStyle(color: HiColors.ink, fontSize: 15)),
            const SizedBox(height: 2),
            Text(fmtDate(str(message['created_at']), context.lang), style: const TextStyle(color: HiColors.muted, fontSize: 11)),
          ],
        ),
      ),
    );
  }
}
