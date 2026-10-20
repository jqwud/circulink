import 'package:flutter/material.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import '../widgets/photo.dart';
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
    try {
      await action();
      await context.app.bump();
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
    final TextEditingController reason = TextEditingController();
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: Text(ctx.tx('Reject this request?')),
        content: TextField(controller: reason, decoration: InputDecoration(labelText: ctx.tx('Reason (optional)'), border: const OutlineInputBorder())),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(ctx.tx('Cancel'))),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text(ctx.tx('Reject'), style: const TextStyle(color: HiColors.danger, fontWeight: FontWeight.w800))),
        ],
      ),
    );
    final String text = reason.text.trim();
    reason.dispose();
    if (ok != true || !mounted) return;
    await _run(() => _post('reject', <String, dynamic>{'reason': text.isEmpty ? null : text}));
  }

  Future<void> _cancel() async {
    final bool ok = await confirmDialog(context, title: context.tx('Cancel this request?'), message: context.tx('Your held credits will be returned.'), confirmLabel: context.tx('Yes, cancel'), danger: true);
    if (!ok || !mounted) return;
    await _run(() => _post('cancel'));
  }

  Future<void> _handover(Map<String, dynamic> r) async {
    final bool needPhoto = str(mapOf(r['item'])['tier']) != 'low';
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
        child: _ReturnSheet(needPhoto: str(mapOf(r['item'])['tier']) != 'low'),
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
    int stars = 5;
    final TextEditingController comment = TextEditingController();
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => StatefulBuilder(
        builder: (BuildContext ctx2, void Function(void Function()) setLocal) => AlertDialog(
          title: Text('${ctx2.tx('Rate')} $whom'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List<Widget>.generate(
                  5,
                  (int i) => IconButton(
                    icon: Icon(i < stars ? Icons.star : Icons.star_border, color: HiColors.sun, size: 34),
                    onPressed: () => setLocal(() => stars = i + 1),
                  ),
                ),
              ),
              TextField(controller: comment, decoration: InputDecoration(labelText: ctx2.tx('Comment (optional)'), border: const OutlineInputBorder())),
            ],
          ),
          actions: <Widget>[
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(ctx2.tx('Cancel'))),
            TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text(ctx2.tx('Send'), style: const TextStyle(fontWeight: FontWeight.w800))),
          ],
        ),
      ),
    );
    final String text = comment.text.trim();
    comment.dispose();
    if (ok != true || !mounted) return;
    await _run(() => _post('rate', <String, dynamic>{'stars': stars, 'comment': text.isEmpty ? null : text}), done: context.tx('Thanks for rating!'));
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
                  Expanded(child: Text(str(item['title']), style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w900))),
                ],
              ),
              const SizedBox(height: 12),
              Wrap(spacing: 6, runSpacing: 6, children: <Widget>[
                StatusChip(statusLabel(context, status), tone: statusTone(status)),
                if (boolOf(r['overdue'])) StatusChip(context.t('Overdue'), tone: Tone.bad),
                StatusChip(costLabel(context, cost), tone: Tone.muted),
              ]),
              const Divider(height: 24),
              _row(context.t('Dates'), fmtRange(str(r['start_date']), str(r['end_date']), context.lang)),
              _row(asOwner ? context.t('Borrower') : context.t('Lender'), otherName),
              if (str(r['pickup_point']).isNotEmpty) _row(context.t('Pickup'), str(r['pickup_point'])),
              if (str(r['return_condition']).isNotEmpty) _row(context.t('Condition at return'), _conditionText(context, str(r['return_condition']))),
              if (r['on_time'] != null && (status == 'closed' || status == 'disputed')) _row(context.t('Returned'), boolOf(r['on_time']) ? context.t('On time') : context.t('Late')),
              if (str(r['note']).isNotEmpty) _row(context.t('Note'), str(r['note'])),
            ],
          ),
        ),
        _guide(context, status, asOwner, staff),
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

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SizedBox(width: 120, child: Text(label, style: const TextStyle(color: HiColors.muted))),
          Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w700))),
        ],
      ),
    );
  }

  /// A plain sentence that says what happens next.
  Widget _guide(BuildContext context, String status, bool asOwner, bool staff) {
    String? text;
    if (staff && (status == 'pending' || status == 'approved' || status == 'handed_over')) {
      text = context.t('This item is handled at the barangay hall. LGU staff approve, hand over and take it back.');
    } else if (status == 'pending') {
      text = asOwner ? context.t('Approve or reject this request.') : context.t('Waiting for the owner to approve. Your credit is held.');
    } else if (status == 'approved') {
      text = asOwner ? context.t('Meet at the pickup point, then tap Confirm handover.') : context.t('Approved! Meet the owner at the pickup point to get the item.');
    } else if (status == 'handed_over') {
      text = asOwner ? context.t('When the item comes back, tap Confirm return.') : context.t('Please return it by the end date to avoid losing a credit.');
    } else if (status == 'disputed') {
      text = context.t('The barangay is reviewing this return.');
    }
    if (text == null) return const SizedBox.shrink();
    return HiCard(color: HiColors.infoSoft, borderColor: HiColors.infoSoft, child: Row(children: <Widget>[
      const Icon(Icons.info_outline, color: HiColors.info),
      const SizedBox(width: 10),
      Expanded(child: Text(text, style: const TextStyle(color: HiColors.info, fontWeight: FontWeight.w600))),
    ]));
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
            Text(context.t('Confirm return'), style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w900)),
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
            TextField(controller: _note, maxLines: 2, decoration: InputDecoration(labelText: context.t('Note (optional)'), border: const OutlineInputBorder())),
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
