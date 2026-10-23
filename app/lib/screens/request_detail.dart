import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import '../widgets/date_range.dart';
import '../widgets/photo.dart';
import 'messages_screen.dart';
import 'report_screen.dart';

/// M10 / M11: one request, with every action that fits its status and who you are.
class RequestDetailScreen extends StatefulWidget {
  final int requestId;
  const RequestDetailScreen({super.key, required this.requestId});

  @override
  State<RequestDetailScreen> createState() => _RequestDetailScreenState();
}

class _RequestDetailScreenState extends State<RequestDetailScreen> {
  int _reloadTick = 0;
  bool _busy = false;

  Future<void> _run(Future<dynamic> Function() action, {String? done, String? doneTitle, String pose = 'happy'}) async {
    setState(() => _busy = true);
    final AppState app = context.app;
    try {
      await action();
      await app.bump();
      if (!mounted) return;
      setState(() => _reloadTick++);
      if (done != null) {
        await pawsaDialog(context, pose: pose, title: doneTitle ?? context.tx('Done!'), message: done);
      }
    } catch (e) {
      if (mounted) showMessage(context, context.app.errorText(e), bad: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _post(String action, [Map<String, dynamic>? body]) =>
      context.app.api.post('/requests/${widget.requestId}/$action', body);

  Future<void> _reject() async {
    final String? reason = await askText(context,
        title: context.tx('Reject this request?'), label: context.tx('Reason (optional)'), confirmLabel: context.tx('Reject'), danger: true, maxLength: 200);
    if (reason == null || !mounted) return;
    await _run(() => _post('reject', <String, dynamic>{'reason': reason.isEmpty ? null : reason}));
  }

  Future<void> _changeDates(Map<String, dynamic> r) async {
    final Map<String, dynamic> item = mapOf(await context.app.api.get('/items/${mapOf(r['item'])['id']}'));
    if (!mounted) return;
    final DateTimeRange? range = await pickBorrowDates(
      context,
      maxDays: context.app.rule('maxLoanDays', 14),
      booked: listOf(item['booked_ranges']),
      initial: parseYmd(str(r['start_date'])) != null && parseYmd(str(r['end_date'])) != null
          ? DateTimeRange(start: parseYmd(str(r['start_date']))!, end: parseYmd(str(r['end_date']))!)
          : null,
    );
    if (range == null || !mounted) return;
    await _run(() => context.app.api.patch('/requests/${widget.requestId}/dates', <String, dynamic>{'start_date': ymd(range.start), 'end_date': ymd(range.end)}));
    if (mounted) showMessage(context, context.tx('Dates changed. The owner was told.'));
  }

  Future<void> _cancel() async {
    final bool ok = await confirmDialog(context, title: context.tx('Cancel this request?'), message: context.tx('Your held credits will be returned.'), confirmLabel: context.tx('Yes, cancel'), danger: true);
    if (!ok || !mounted) return;
    await _run(() => _post('cancel'));
  }

  Future<void> _handover(Map<String, dynamic> r) async {
    final bool needPhoto = boolOf(r['photo_required']);
    String? photo;
    if (needPhoto) {
      photo = await pickAndUploadPhoto(context);
      if (photo == null) {
        if (mounted) showMessage(context, context.tx('A condition photo is required for this item.'), bad: true);
        return;
      }
    } else {
      final bool ok = await confirmDialog(context, title: context.tx('Confirm handover?'), message: context.tx('Confirm that the borrower has received the item.'), confirmLabel: context.tx('Confirm'));
      if (!ok) return;
    }
    if (!mounted) return;
    await _run(() => _post('handover', <String, dynamic>{'photo': photo}), done: context.tx('The item is now with the borrower.'), doneTitle: context.tx('Handed over'));
  }

  Future<void> _return(Map<String, dynamic> r) async {
    final Map<String, dynamic>? result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (BuildContext sheetContext) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(sheetContext).viewInsets.bottom),
        child: _ReturnSheet(needPhoto: boolOf(r['photo_required'])),
      ),
    );
    if (result == null || !mounted) return;
    final bool good = result['condition'] == 'good';
    await _run(
      () => _post('return', result),
      done: good ? context.tx('Return confirmed. Credits were updated.') : context.tx('The barangay will review this and contact both of you.'),
      doneTitle: good ? context.tx('Item returned') : context.tx('Sent for review'),
      pose: good ? 'cheer' : 'oops',
    );
  }

  Future<void> _checkin(String answer, {String? note, String? done, String? doneTitle}) =>
      _run(() => _post('checkin', <String, dynamic>{'answer': answer, 'note': note}), done: done, doneTitle: doneTitle);

  Future<void> _sayReturned() async {
    final bool ok = await confirmDialog(context,
        title: context.tx('Did you give it back?'),
        message: context.tx('We save the time now, so a late confirmation by the owner never costs you a credit.'),
        confirmLabel: context.tx('Yes, I returned it'));
    if (!ok || !mounted) return;
    await _checkin('returned', done: context.tx('The owner will check the item and confirm.'), doneTitle: context.tx('Return noted'));
  }

  Future<void> _reportProblem() async {
    final String? text = await askText(context,
        title: context.tx("What's the problem?"), label: context.tx('Tell us briefly what happened'), confirmLabel: context.tx('Send'), required: true);
    if (text == null || !mounted) return;
    await _checkin('problem', note: text, done: context.tx('The owner and the barangay were told. They will contact you.'), doneTitle: context.tx('Problem sent'));
  }

  Future<void> _survey() async {
    final String? answer = await showDialog<String>(
      context: context,
      builder: (BuildContext ctx) => SimpleDialog(
        title: Text(ctx.tx('If you could not borrow this, would you have bought or rented it?')),
        children: <Widget>[
          SimpleDialogOption(onPressed: () => Navigator.pop(ctx, 'yes'), child: Text(ctx.tx('Yes, I would have bought or rented it'))),
          SimpleDialogOption(onPressed: () => Navigator.pop(ctx, 'maybe'), child: Text(ctx.tx('Maybe'))),
          SimpleDialogOption(onPressed: () => Navigator.pop(ctx, 'no'), child: Text(ctx.tx('No, I would have gone without'))),
        ],
      ),
    );
    if (answer == null || !mounted) return;
    await _run(() => _post('survey', <String, dynamic>{'would_have_bought': answer}), done: context.tx('Thank you! This helps the barangay measure how much we save together.'));
  }

  Future<void> _rate(String whom) async {
    final Map<String, dynamic>? r = await showHiSheet<Map<String, dynamic>>(context, title: '${context.tx('Rate')} $whom', builder: (BuildContext s) => const _RateSheet());
    if (r == null || !mounted) return;
    await _run(() => _post('rate', r), done: context.tx('Thanks for rating!'));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: hiAppBar(context.t('Request')),
      body: AsyncView<Map<String, dynamic>>(
        refreshKey: _reloadTick,
        loader: () async => mapOf(await context.app.api.get('/requests/${widget.requestId}')),
        builder: (BuildContext ctx, Map<String, dynamic> r, Future<void> Function() reload) => _body(ctx, r),
      ),
    );
  }

  Widget _body(BuildContext context, Map<String, dynamic> r) {
    final Map<String, dynamic> item = mapOf(r['item']);
    final Map<String, dynamic> owner = mapOf(r['owner']);
    final Map<String, dynamic> borrower = mapOf(r['borrower']);
    final String status = str(r['status']);
    final String role = str(r['my_role']);
    final bool staff = boolOf(r['handled_by_staff']);
    final bool asOwner = role == 'owner';
    final bool asBorrower = role == 'borrower';
    final int cost = intOf(r['credit_cost']);
    final String otherName = asOwner ? str(borrower['name']) : (owner.isEmpty ? context.t('Barangay Shelf') : str(owner['name']));

    final List<Widget> actions = <Widget>[];
    if (asOwner && !staff) {
      if (status == 'pending') {
        actions.add(PrimaryButton(label: context.t('Approve'), icon: Icons.check, busy: _busy, onPressed: () => _run(() => _post('approve'), done: context.tx('Approved. Agree on the pickup with the borrower.'), doneTitle: context.tx('Approved'))));
        actions.add(const SizedBox(height: 8));
        actions.add(SoftButton(label: context.t('Reject'), icon: Icons.close, onPressed: _busy ? null : _reject));
      } else if (status == 'approved') {
        actions.add(PrimaryButton(label: context.t('Confirm handover'), icon: Icons.handshake, busy: _busy, onPressed: () => _handover(r)));
      } else if (status == 'handed_over') {
        actions.add(PrimaryButton(label: context.t('Confirm return'), icon: Icons.assignment_return, busy: _busy, onPressed: () => _return(r)));
      }
    }
    if (asBorrower && status == 'pending') {
      actions.add(SoftButton(label: context.t('Change dates'), icon: Icons.edit_calendar, onPressed: _busy ? null : () => _changeDates(r)));
      actions.add(const SizedBox(height: 8));
    }
    if (asBorrower && (status == 'pending' || status == 'approved')) {
      if (actions.isNotEmpty) actions.add(const SizedBox(height: 8));
      actions.add(SoftButton(label: context.t('Cancel request'), icon: Icons.cancel_outlined, onPressed: _busy ? null : _cancel));
    }
    if (asBorrower && (status == 'closed' || status == 'disputed')) {
      if (r['survey'] == null) {
        actions.add(PrimaryButton(label: context.t('Answer one quick question'), icon: Icons.question_answer, busy: _busy, onPressed: _survey));
        actions.add(const SizedBox(height: 8));
      }
    }
    if ((status == 'closed' || status == 'disputed') && (asBorrower || asOwner) && (asBorrower ? owner.isNotEmpty : true)) {
      actions.add(SoftButton(label: '${context.t('Rate')} $otherName', icon: Icons.star_outline, onPressed: _busy ? null : () => _rate(otherName)));
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: <Widget>[
        HiCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  ItemThumb(item: <String, dynamic>{'photo_url': item['photo_url'], 'category': <String, dynamic>{'slug': item['category_slug']}}, size: 60),
                  const SizedBox(width: 12),
                  Expanded(child: Text(str(item['title']), style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800))),
                ],
              ),
              const SizedBox(height: 12),
              Wrap(spacing: 6, runSpacing: 6, children: <Widget>[
                StatusChip(statusLabel(context, status), tone: statusTone(status)),
                if (boolOf(r['overdue'])) StatusChip(context.t('Overdue'), tone: Tone.bad),
                StatusChip(costLabel(context, cost), tone: Tone.muted),
              ]),
              const Divider(height: 24),
              KeyValueRow(context.t('Dates'), fmtRange(str(r['start_date']), str(r['end_date']), context.lang)),
              KeyValueRow(asOwner ? context.t('Borrower') : context.t('Lender'), otherName),
              if (str(r['pickup_point']).isNotEmpty) KeyValueRow(context.t('Pickup'), str(r['pickup_point'])),
              if (asOwner && status == 'handed_over' && str(r['borrower_returned_at']).isEmpty) KeyValueRow(context.t('Last check-in'), _lastCheckin(context, mapOf(r['checkin']))),
              if (str(r['return_condition']).isNotEmpty) KeyValueRow(context.t('Condition at return'), _conditionText(context, str(r['return_condition']))),
              if (str(r['dispute_outcome']).isNotEmpty) KeyValueRow(context.t('Settled'), _outcomeText(context, str(r['dispute_outcome']))),
              if (r['on_time'] != null && (status == 'closed' || status == 'disputed')) KeyValueRow(context.t('Returned'), boolOf(r['on_time']) ? context.t('On time') : context.t('Late')),
              if (str(r['note']).isNotEmpty) KeyValueRow(context.t('Note'), str(r['note'])),
            ],
          ),
        ),
        if ((asBorrower || asOwner) && (mapOf(r['contact']).isNotEmpty || boolOf(r['thread_open']) || intOf(r['message_count']) > 0)) _contactCard(context, r),
        _Timeline(request: r),
        if (asBorrower && status == 'handed_over' && str(r['borrower_returned_at']).isEmpty) _checkinCard(context, r),
        _guide(context, r, asOwner, staff),
        const SizedBox(height: 4),
        ...actions,
        const SizedBox(height: 12),
        if (asBorrower || asOwner)
          Center(
            child: TextButton.icon(
              icon: const Icon(Icons.flag_outlined, size: 18),
              label: Text(context.t('Report a problem')),
              onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (BuildContext c) => ReportScreen(targetType: 'request', targetId: intOf(r['id']), subject: str(item['title'])))),
            ),
          ),
      ],
    );
  }

  Future<void> _launch(String uri) async {
    bool ok = false;
    try {
      ok = await launchUrl(Uri.parse(uri));
    } catch (_) {
      ok = false;
    }
    if (!ok && mounted) showMessage(context, context.tx('Could not open the phone app.'), bad: true);
  }

  Future<void> _openMessages(Map<String, dynamic> r) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (BuildContext c) => MessagesScreen(requestId: intOf(r['id']), title: str(mapOf(r['item'])['title'])),
    ));
    if (mounted) setState(() => _reloadTick++);
  }

  /// Who to call or text about this loan. Numbers show only after approval, until a week after it closes;
  /// items the barangay handles show the hall. The message thread works from the first request.
  Widget _contactCard(BuildContext context, Map<String, dynamic> r) {
    final Map<String, dynamic> c = mapOf(r['contact']);
    final bool hall = str(c['kind']) == 'hall';
    final String phone = str(c['phone']);
    final String dial = phone.replaceAll(RegExp(r'[^0-9+]'), '');
    final int count = intOf(r['message_count']);
    return HiCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(context.t('Contact'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 6),
          if (c.isNotEmpty) ...<Widget>[
            Row(children: <Widget>[
              Icon(hall ? Icons.account_balance : Icons.person, color: HiColors.accent, size: 20),
              const SizedBox(width: 8),
              Expanded(child: Text(str(c['name']), style: const TextStyle(fontWeight: FontWeight.w800))),
            ]),
            if (hall && str(c['hours']).isNotEmpty)
              Text('${str(c['note'])} · ${str(c['hours'])}', style: const TextStyle(color: HiColors.muted)),
            const SizedBox(height: 4),
            Text(phone.isNotEmpty ? phone : context.t('No phone number on file. Use the messages.'), style: TextStyle(color: phone.isNotEmpty ? HiColors.ink : HiColors.muted)),
            if (dial.isNotEmpty) ...<Widget>[
              const SizedBox(height: 8),
              Row(children: <Widget>[
                Expanded(child: SoftButton(label: context.t('Call'), icon: Icons.call, onPressed: () => _launch('tel:$dial'))),
                const SizedBox(width: 8),
                Expanded(child: SoftButton(label: context.t('Text'), icon: Icons.sms_outlined, onPressed: () => _launch('sms:$dial'))),
              ]),
            ],
            const SizedBox(height: 8),
          ] else
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(context.t('Phone numbers are shared once the request is approved.'), style: const TextStyle(color: HiColors.muted)),
            ),
          SoftButton(
            label: count > 0 ? '${context.t('Messages')} ($count)' : context.t('Send a message'),
            icon: Icons.chat_bubble_outline,
            onPressed: () => _openMessages(r),
          ),
        ],
      ),
    );
  }

  String _lastCheckin(BuildContext context, Map<String, dynamic> c) {
    final int missed = intOf(c['missed_days']);
    if (missed >= 2) return '${context.t('None for')} $missed ${context.t('days')}';
    if (str(c['last_day']).isEmpty) return context.t('None yet');
    return '${fmtDate(str(c['last_day']), context.lang)} · ${_answerText(context, str(c['last_answer']))}';
  }

  String _answerText(BuildContext context, String a) {
    switch (a) {
      case 'with_me':
        return context.t('Still with me');
      case 'problem':
        return context.t("There's a problem");
      default:
        return context.t('I returned it');
    }
  }

  /// While the item is out the borrower answers once a day. "I returned it" can be tapped any time.
  Widget _checkinCard(BuildContext context, Map<String, dynamic> r) {
    final Map<String, dynamic> c = mapOf(r['checkin']);
    final bool due = boolOf(c['due_today']);
    final int missed = intOf(c['missed_days']);
    final bool doneToday = str(c['last_day']) == ymd(phToday());
    final String text = due
        ? (missed > 0 ? context.t('You missed a check-in. Please answer now.') : context.t('Is the item still with you?'))
        : (doneToday ? '${context.t('Thanks, you checked in today:')} ${_answerText(context, str(c['last_answer']))}.' : context.t('Your first check-in is tomorrow.'));
    return HiCard(
      color: due ? HiColors.sunSoft : HiColors.card,
      borderColor: due ? HiColors.sun : HiColors.line,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(children: <Widget>[
            Icon(due ? Icons.notifications_active_outlined : Icons.event_available, color: due ? HiColors.warn : HiColors.accent),
            const SizedBox(width: 8),
            Text(context.t('Daily check-in'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          ]),
          const SizedBox(height: 6),
          Text(text, style: const TextStyle(color: HiColors.ink)),
          const SizedBox(height: 10),
          if (!doneToday) ...<Widget>[
            PrimaryButton(label: context.t('Still with me'), icon: Icons.check, busy: _busy, onPressed: () => _checkin('with_me')),
            const SizedBox(height: 8),
          ],
          SoftButton(label: context.t('I returned it'), icon: Icons.assignment_return, onPressed: _busy ? null : _sayReturned),
          const SizedBox(height: 8),
          SoftButton(label: context.t("There's a problem"), icon: Icons.report_gmailerrorred, onPressed: _busy ? null : _reportProblem),
        ],
      ),
    );
  }

  String _outcomeText(BuildContext c, String v) {
    switch (v) {
      case 'fine':
        return c.t('It was fine after all');
      case 'accident':
        return c.t('An accident, nobody to blame');
      case 'borrower_fault':
        return c.t('Damaged by the borrower');
      default:
        return c.t('The item was lost');
    }
  }

  String _conditionText(BuildContext c, String v) {
    switch (v) {
      case 'damaged':
        return c.t('Damaged');
      case 'lost':
        return c.t('Lost');
      default:
        return c.t('Good');
    }
  }

  /// A plain sentence that says what happens next.
  Widget _guide(BuildContext context, Map<String, dynamic> r, bool asOwner, bool staff) {
    final String status = str(r['status']);
    final String saidReturned = str(r['borrower_returned_at']);
    String? text;
    if (status == 'handed_over' && saidReturned.isNotEmpty) {
      final String when = fmtDate(saidReturned, context.lang);
      text = asOwner
          ? '${context.t('The borrower says it was returned on')} $when. ${staff ? context.t('The barangay will confirm the return.') : context.t('Check the item, then tap Confirm return.')}'
          : '${context.t('You said you returned it on')} $when. ${context.t('Waiting for the return to be confirmed.')}';
    } else if (staff && (status == 'pending' || status == 'approved' || status == 'handed_over')) {
      text = context.t('This item is handled at the barangay hall. LGU staff approve, hand over and take it back.');
    } else if (status == 'pending') {
      text = asOwner ? context.t('Approve or reject this request.') : context.t('Waiting for the owner to approve. Your credit is held.');
      if (str(r['expires_on']).isNotEmpty) text = '$text ${context.t('If nobody answers, it expires on')} ${fmtDate(str(r['expires_on']), context.lang)}.';
    } else if (status == 'approved') {
      text = asOwner ? context.t('Meet at the pickup point, then tap Confirm handover.') : context.t('Approved! Meet the owner at the pickup point to get the item.');
    } else if (status == 'handed_over') {
      text = asOwner ? context.t('When the item comes back, tap Confirm return.') : context.t('Please return it by the end date. When you give it back, tap I returned it.');
    } else if (status == 'disputed') {
      text = context.t('The barangay is reviewing this return.');
    }
    if (text == null) return const SizedBox.shrink();
    return InfoBanner(text);
  }
}

/// Where the request stands: requested, approved, borrowed, returned, with dates and held credits.
class _Timeline extends StatelessWidget {
  final Map<String, dynamic> request;
  const _Timeline({required this.request});

  @override
  Widget build(BuildContext context) {
    final Map<String, dynamic> r = request;
    final String status = str(r['status']);
    final String lang = context.lang;
    String when(String key) => str(r[key]).isEmpty ? '' : fmtDate(str(r[key]), lang);
    final bool ended = <String>['rejected', 'cancelled', 'expired'].contains(status);
    // A step is done once the request has passed it, even for older requests saved before its time was recorded.
    final bool approved = str(r['approved_at']).isNotEmpty || <String>['approved', 'handed_over', 'closed', 'disputed'].contains(status);
    final bool borrowed = str(r['handed_over_at']).isNotEmpty || <String>['handed_over', 'closed', 'disputed'].contains(status);
    final List<_Step> steps = <_Step>[
      _Step(context.t('Requested'), when('created_at'), true),
      if (!ended || str(r['approved_at']).isNotEmpty) _Step(context.t('Approved'), when('approved_at'), approved),
      if (ended) _Step(statusLabel(context, status), '', true, stop: true),
      if (!ended) _Step(context.t('Borrowed'), when('handed_over_at'), borrowed),
      if (!ended && str(r['borrower_returned_at']).isNotEmpty) _Step(context.t('Borrower says returned'), when('borrower_returned_at'), true),
      if (!ended) _Step(context.t('Return confirmed'), when('returned_at'), str(r['returned_at']).isNotEmpty),
    ];
    final int cost = intOf(r['credit_cost']);
    return HiCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(context.t('Progress'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 8),
          for (int i = 0; i < steps.length; i++) _stepRow(steps[i], last: i == steps.length - 1, next: !steps[i].done && (i == 0 || steps[i - 1].done)),
          if (boolOf(r['credits_held']) && cost > 0) ...<Widget>[
            const SizedBox(height: 6),
            Text('${context.t('Credits on hold')}: $cost', style: const TextStyle(color: HiColors.muted, fontWeight: FontWeight.w700)),
          ],
        ],
      ),
    );
  }

  Widget _stepRow(_Step s, {required bool last, required bool next}) {
    final Color color = s.stop ? HiColors.danger : (s.done ? HiColors.accent : (next ? HiColors.warn : HiColors.lineStrong));
    final IconData icon = s.stop ? Icons.cancel : (s.done ? Icons.check_circle : (next ? Icons.radio_button_checked : Icons.radio_button_unchecked));
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Column(children: <Widget>[
            Icon(icon, size: 20, color: color),
            if (!last) Expanded(child: Container(width: 2, color: s.done ? HiColors.accent : HiColors.line)),
          ]),
          const SizedBox(width: 10),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Wrap(spacing: 8, children: <Widget>[
                Text(s.label, style: TextStyle(fontWeight: FontWeight.w800, color: s.done || next ? HiColors.ink : HiColors.muted)),
                if (s.date.isNotEmpty) Text(s.date, style: const TextStyle(color: HiColors.muted)),
              ]),
            ),
          ),
        ],
      ),
    );
  }
}

class _Step {
  final String label;
  final String date;
  final bool done;
  final bool stop;
  const _Step(this.label, this.date, this.done, {this.stop = false});
}

/// Stars and a comment. The sheet owns its text field, so it is never used after it is gone.
class _RateSheet extends StatefulWidget {
  const _RateSheet();

  @override
  State<_RateSheet> createState() => _RateSheetState();
}

class _RateSheetState extends State<_RateSheet> {
  final TextEditingController _comment = TextEditingController();
  int _stars = 5;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List<Widget>.generate(
            5,
            (int i) => IconButton(
              tooltip: '${i + 1} / 5',
              isSelected: i < _stars,
              icon: Icon(i < _stars ? Icons.star : Icons.star_border, color: HiColors.sun, size: 36),
              onPressed: () => setState(() => _stars = i + 1),
            ),
          ),
        ),
        const SizedBox(height: HiSpace.sm),
        HiTextField(controller: _comment, label: context.t('Comment (optional)'), minLines: 1, maxLines: 3, maxLength: 200, textCapitalization: TextCapitalization.sentences),
        const SizedBox(height: HiSpace.md),
        PrimaryButton(
          label: context.t('Send'),
          onPressed: () => Navigator.pop(context, <String, dynamic>{'stars': _stars, 'comment': _comment.text.trim().isEmpty ? null : _comment.text.trim()}),
        ),
        const SizedBox(height: HiSpace.sm),
        SoftButton(label: context.t('Cancel'), onPressed: () => Navigator.pop(context)),
      ],
    );
  }
}

class _ReturnSheet extends StatefulWidget {
  final bool needPhoto;
  const _ReturnSheet({required this.needPhoto});

  @override
  State<_ReturnSheet> createState() => _ReturnSheetState();
}

class _ReturnSheetState extends State<_ReturnSheet> {
  String _condition = 'good';
  String? _photo;
  final TextEditingController _note = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _takePhoto() async {
    final String? url = await pickAndUploadPhoto(context);
    if (url != null && mounted) setState(() => _photo = url);
  }

  void _submit() {
    if (widget.needPhoto && _condition == 'good' && _photo == null) {
      setState(() => _error = context.tx('A condition photo is required for this item.'));
      return;
    }
    Navigator.pop(context, <String, dynamic>{
      'condition': _condition,
      'note': _note.text.trim().isEmpty ? null : _note.text.trim(),
      'photo': _photo,
    });
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(context.t('Confirm return'), style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            Text(context.t('What is the condition of the item?'), style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: <String>['good', 'damaged', 'lost']
                  .map((String c) => ChoiceChip(
                        label: Text(c == 'good' ? context.t('Good') : (c == 'damaged' ? context.t('Damaged') : context.t('Lost'))),
                        selected: _condition == c,
                        showCheckmark: false,
                        selectedColor: c == 'good' ? HiColors.leafSoft : HiColors.dangerSoft,
                        onSelected: (_) => setState(() => _condition = c),
                      ))
                  .toList(),
            ),
            if (_condition != 'good')
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(context.t('No lending credit is given until the barangay settles this.'), style: const TextStyle(color: HiColors.danger, fontSize: 13)),
              ),
            const SizedBox(height: 12),
            SoftButton(
              label: _photo == null ? (widget.needPhoto && _condition == 'good' ? context.t('Add condition photo (required)') : context.t('Add photo (optional)')) : context.t('Photo added. Tap to change'),
              icon: _photo == null ? Icons.photo_camera : Icons.check_circle,
              onPressed: _takePhoto,
            ),
            const SizedBox(height: 12),
            TextField(controller: _note, maxLines: 2, decoration: InputDecoration(labelText: context.t('Note (optional)'))),
            if (_error != null) ...<Widget>[
              const SizedBox(height: 8),
              Text(_error!, style: const TextStyle(color: HiColors.danger, fontWeight: FontWeight.w700)),
            ],
            const SizedBox(height: 16),
            PrimaryButton(label: context.t('Confirm return'), onPressed: _submit, danger: _condition != 'good'),
          ],
        ),
      ),
    );
  }
}
