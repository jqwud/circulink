import 'package:flutter/material.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import '../widgets/date_range.dart';
import 'claim_screen.dart';
import 'report_screen.dart';
import 'request_detail.dart';

void openItem(BuildContext context, int id) {
  Navigator.of(context).push(MaterialPageRoute<void>(builder: (BuildContext c) => ItemDetailScreen(itemId: id)));
}

/// M6: one item. Photo, rules, who owns it, booked dates and the Borrow button.
class ItemDetailScreen extends StatelessWidget {
  final int itemId;
  const ItemDetailScreen({super.key, required this.itemId});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: hiAppBar(context.t('Item')),
      body: AsyncView<Map<String, dynamic>>(
        loader: () async => mapOf(await context.app.api.get('/items/$itemId')),
        builder: (BuildContext ctx, Map<String, dynamic> item, Future<void> Function() reload) => _ItemBody(item: item, reload: reload),
      ),
    );
  }
}

class _ItemBody extends StatelessWidget {
  final Map<String, dynamic> item;
  final Future<void> Function() reload;
  const _ItemBody({required this.item, required this.reload});

  String _conditionLabel(BuildContext c, String v) {
    switch (v) {
      case 'new':
        return c.t('Like new');
      case 'fair':
        return c.t('Fair');
      case 'worn':
        return c.t('Well used');
      default:
        return c.t('Good');
    }
  }

  @override
  Widget build(BuildContext context) {
    final bool shelf = boolOf(item['is_shelf']);
    final Map<String, dynamic> owner = mapOf(item['owner']);
    final Map<String, dynamic> pickup = mapOf(item['pickup_point']);
    final Map<String, dynamic> category = mapOf(item['category']);
    final String tier = str(item['tier'], 'low');
    final int cost = intOf(item['credit_cost']);
    final bool staff = boolOf(item['handled_by_staff']);
    final List<Map<String, dynamic>> booked = listOf(item['booked_ranges']);
    final bool mine = owner.isNotEmpty && intOf(owner['id']) == context.app.userId;
    final bool donation = FreeBadge.isDonation(item);
    final bool available = str(item['status']) == 'available' && (!donation || str(item['donation_status']) == 'open');
    final String photo = context.app.api.absolute(item['photo_url'] as String?);
    final String desc = str(item['description']);
    final dynamic rating = owner['rating'];

    return Column(
      children: <Widget>[
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: <Widget>[
              ClipRRect(
                borderRadius: BorderRadius.circular(kRadius),
                child: SizedBox(
                  height: 210,
                  width: double.infinity,
                  child: photo.isEmpty
                      ? Container(color: HiColors.primarySoft, child: Icon(categoryIcon(str(category['slug'])), size: 80, color: HiColors.accent))
                      : Image.network(photo, fit: BoxFit.cover, semanticLabel: '${context.t('Photo of')} ${str(item['title'])}', errorBuilder: (BuildContext c, Object e, StackTrace? s) => Container(color: HiColors.primarySoft, child: const Icon(Icons.image_not_supported, color: HiColors.accent))),
                ),
              ),
              const SizedBox(height: 14),
              Align(
                alignment: Alignment.centerLeft,
                child: Wrap(spacing: 6, runSpacing: 6, children: <Widget>[OriginBadge(item: item), if (donation) const FreeBadge()]),
              ),
              const SizedBox(height: 8),
              Text(str(item['title']), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: HiColors.ink)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: <Widget>[
                  StatusChip(tierLabel(context, tier), tone: tierTone(tier)),
                  StatusChip(costLabel(context, cost), tone: Tone.info),
                  StatusChip(_conditionLabel(context, str(item['condition'])), tone: Tone.muted),
                  if (boolOf(item['repair_reuse'])) StatusChip(context.t('Repair and Reuse'), tone: Tone.ok),
                  if (boolOf(item['is_out'])) StatusChip(context.t('Borrowed'), tone: Tone.info),
                ],
              ),
              if (desc.isNotEmpty) ...<Widget>[
                const SizedBox(height: 12),
                Text(desc, style: const TextStyle(fontSize: 15, height: 1.4)),
              ],
              const SizedBox(height: 14),
              HiCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    _line(
                      shelf ? Icons.account_balance : Icons.person_outline,
                      shelf
                          ? context.t('This item belongs to the Barangay. Pick it up and return it at the barangay hall. Staff check it with you.')
                          : '${context.tv('This item belongs to {name}, a verified neighbor in {purok}.', <String, Object>{'name': str(owner['name']), 'purok': str(owner['purok'], '-')})}${rating != null ? '  ★ $rating' : ''}',
                    ),
                    if (donation)
                      _line(Icons.volunteer_activism, str(item['claim_mode']) == 'barangay'
                          ? context.t('Free to take. The barangay chooses who receives it, families in need first. Ask for it within 3 days.')
                          : context.t('Free to take. The first to claim it has 48 hours to pick it up. No credits needed.'))
                    else
                    _line(Icons.timer_outlined, context.tv('Borrow for up to {n} days.', <String, Object>{'n': intOf(item['max_loan_days'], context.app.rule('maxLoanDays', 14))})),
                    if (pickup.isNotEmpty) _line(Icons.place_outlined, '${str(pickup['name'])}${str(pickup['hours']).isEmpty ? '' : ' · ${str(pickup['hours'])}'}'),
                    if (pickup.isNotEmpty && str(pickup['note']).isNotEmpty) _line(Icons.info_outline, str(pickup['note'])),
                    _line(
                      staff ? Icons.account_balance : Icons.handshake_outlined,
                      staff ? context.t('Handover and return happen at the barangay hall with LGU staff.') : context.t('Meet your neighbor at the pickup point to hand over and return.'),
                    ),
                    if (tier == 'medium') _line(Icons.photo_camera_outlined, context.t('A photo of the item is taken at handover and return.')),
                  ],
                ),
              ),
              if (booked.isNotEmpty) ...<Widget>[
                SectionTitle(context.t('Already booked')),
                ...booked.map((Map<String, dynamic> b) => Padding(
                      padding: const EdgeInsets.only(left: 4, bottom: 4),
                      child: Row(children: <Widget>[
                        const Icon(Icons.event_busy, size: 18, color: HiColors.muted),
                        const SizedBox(width: 8),
                        Text(fmtRange(str(b['start_date']), str(b['end_date']), context.lang)),
                      ]),
                    )),
              ],
              const SizedBox(height: 8),
              if (!mine)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    icon: const Icon(Icons.flag_outlined, size: 18),
                    label: Text(context.t('Report this item')),
                    onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (BuildContext c) => ReportScreen(targetType: 'item', targetId: intOf(item['id']), subject: str(item['title'])))),
                  ),
                ),
            ],
          ),
        ),
        if (mine && donation && str(item['donation_status']) == 'open')
          _DonorChoices(item: item, reload: reload)
        else if (!mine && donation)
          _ClaimBar(item: item, available: available, reload: reload)
        else if (!mine)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: HiColors.line))),
            child: SafeArea(
              top: false,
              child: PrimaryButton(
                label: available ? '${context.t('Borrow')} · ${costLabel(context, cost)}' : context.t('Not available'),
                icon: Icons.shopping_bag_outlined,
                onPressed: available
                    ? () {
                        if (!context.app.isApproved) {
                          showMessage(context, context.tx('Your account must be verified by the barangay first.'), bad: true);
                          return;
                        }
                        showRequestSheet(context, item, reload);
                      }
                    : null,
              ),
            ),
          ),
      ],
    );
  }

  Widget _line(IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(icon, size: 20, color: HiColors.accent),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: const TextStyle(height: 1.3))),
        ],
      ),
    );
  }
}

/// The bottom bar of a free item: claim it (first to claim) or ask for it (the barangay chooses).
class _ClaimBar extends StatefulWidget {
  final Map<String, dynamic> item;
  final bool available;
  final Future<void> Function() reload;
  const _ClaimBar({required this.item, required this.available, required this.reload});

  @override
  State<_ClaimBar> createState() => _ClaimBarState();
}

class _ClaimBarState extends State<_ClaimBar> {
  bool _busy = false;

  Future<void> _claim() async {
    if (!context.app.isApproved) {
      showMessage(context, context.tx('Your account must be verified by the barangay first.'), bad: true);
      return;
    }
    setState(() => _busy = true);
    final AppState app = context.app;
    try {
      final Map<String, dynamic> out = mapOf(await app.api.post('/items/${widget.item['id']}/claim'));
      await app.bump();
      if (!mounted) return;
      if (str(out['status']) == 'waiting') {
        await pawsaDialog(context, pose: 'happy', title: context.tx('Request sent'),
            message: context.tx('The barangay will choose who receives it after 3 days, families in need first. You will get a notice either way.'));
        if (mounted) Navigator.pop(context);
      } else {
        await pawsaDialog(context, pose: 'cheer', title: context.tx('It is yours to pick up!'), message: context.tx('You have 48 hours. Agree on a pickup time in the messages.'));
        if (!mounted) return;
        Navigator.of(context).pushReplacement(MaterialPageRoute<void>(builder: (BuildContext c) => ClaimScreen(claimId: intOf(out['id']))));
      }
    } catch (e) {
      if (mounted) showMessage(context, context.app.errorText(e), bad: true);
      await widget.reload();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bool barangay = str(widget.item['claim_mode']) == 'barangay';
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: HiColors.line))),
      child: SafeArea(
        top: false,
        child: PrimaryButton(
          label: !widget.available ? context.t('Already claimed') : (barangay ? context.t('I would like this') : context.t('Claim it (free)')),
          icon: Icons.volunteer_activism,
          busy: _busy,
          onPressed: widget.available ? _claim : null,
        ),
      ),
    );
  }
}

/// The donor's own open donation: keep it listed longer, give it to the Barangay Shelf, or take it down.
class _DonorChoices extends StatelessWidget {
  final Map<String, dynamic> item;
  final Future<void> Function() reload;
  const _DonorChoices({required this.item, required this.reload});

  Future<void> _do(BuildContext context, String action, String done) async {
    final AppState app = context.app;
    try {
      await app.api.post('/items/${item['id']}/donation', <String, dynamic>{'action': action});
      await app.bump();
      if (!context.mounted) return;
      showMessage(context, done);
      if (action == 'extend') {
        await reload();
      } else {
        Navigator.pop(context);
      }
    } catch (e) {
      if (context.mounted) showMessage(context, app.errorText(e), bad: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: HiColors.line))),
      child: SafeArea(
        top: false,
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: <Widget>[
          Text(context.tv('Listed until {date}.', <String, Object>{'date': fmtDate(str(item['open_until']), context.lang)}), style: const TextStyle(color: HiColors.muted)),
          const SizedBox(height: 8),
          SoftButton(label: context.t('Keep it listed 14 more days'), icon: Icons.more_time, onPressed: () => _do(context, 'extend', context.tx('Listed for 14 more days.'))),
          const SizedBox(height: 8),
          SoftButton(label: context.t('Give it to the Barangay Shelf'), icon: Icons.account_balance, onPressed: () => _do(context, 'to_shelf', context.tx('Thank you! Please bring it to the barangay hall.'))),
          const SizedBox(height: 8),
          SoftButton(label: context.t('Take it down'), icon: Icons.delete_outline, onPressed: () => _do(context, 'withdraw', context.tx('Taken down.'))),
        ]),
      ),
    );
  }
}

/// M7: choose dates and send the request.
Future<void> showRequestSheet(BuildContext context, Map<String, dynamic> item, Future<void> Function() reload) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (BuildContext sheetContext) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(sheetContext).viewInsets.bottom),
      child: _RequestSheet(item: item, parentContext: context, reload: reload),
    ),
  );
}

class _RequestSheet extends StatefulWidget {
  final Map<String, dynamic> item;
  final BuildContext parentContext;
  final Future<void> Function() reload;
  const _RequestSheet({required this.item, required this.parentContext, required this.reload});

  @override
  State<_RequestSheet> createState() => _RequestSheetState();
}

class _RequestSheetState extends State<_RequestSheet> {
  DateTime? _start;
  DateTime? _end;
  bool _busy = false;
  String? _error;

  Future<void> _pickDates() async {
    final int maxDays = intOf(widget.item['max_loan_days'], context.app.rule('maxLoanDays', 14));
    final DateTimeRange? r = await pickBorrowDates(
      context,
      maxDays: maxDays,
      booked: listOf(widget.item['booked_ranges']),
      initial: _start != null && _end != null ? DateTimeRange(start: _start!, end: _end!) : null,
    );
    if (r != null && mounted) {
      setState(() {
        _start = r.start;
        _end = r.end;
        _error = daysInclusive(r.start, r.end) > maxDays ? context.txv('You can borrow for up to {n} days.', <String, Object>{'n': maxDays}) : null;
      });
    }
  }

  Future<void> _send() async {
    if (_start == null || _end == null) {
      setState(() => _error = context.tx('Choose a start and end date.'));
      return;
    }
    final int maxDays = intOf(widget.item['max_loan_days'], context.app.rule('maxLoanDays', 14));
    if (daysInclusive(_start!, _end!) > maxDays) {
      setState(() => _error = context.txv('You can borrow for up to {n} days.', <String, Object>{'n': maxDays}));
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final AppState app = context.app;
    final dynamic res;
    try {
      res = await app.api.post('/requests', <String, dynamic>{
        'item_id': intOf(widget.item['id']),
        'start_date': ymd(_start!),
        'end_date': ymd(_end!),
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = context.app.errorText(e);
        });
      }
      return;
    }
    final Map<String, dynamic> out = mapOf(res);
    final BuildContext parent = widget.parentContext;
    final String status = str(out['status']);
    final bool staff = boolOf(out['handled_by_staff']);
    if (mounted) Navigator.pop(context);
    await app.bump();
    if (!parent.mounted) return;
    String title;
    String msg;
    if (status == 'approved') {
      title = parent.tx('You got it!');
      msg = staff ? parent.tx('Your request is approved. Pick it up at the barangay hall.') : parent.tx('Your request is approved. Agree on the pickup with the owner.');
    } else {
      title = parent.tx('Request sent');
      msg = staff ? parent.tx('Barangay staff will review your request.') : parent.tx('The owner will approve or reject your request. Your credit is held until then.');
    }
    await playDecision(parent, status == 'approved' ? Decision.gotItNow : Decision.requestSent);
    if (!parent.mounted) return;
    await pawsaDialog(parent, pose: 'cheer', title: title, message: msg);
    if (!parent.mounted) return;
    Navigator.of(parent).pushReplacement(MaterialPageRoute<void>(builder: (BuildContext c) => RequestDetailScreen(requestId: intOf(out['id']))));
  }

  @override
  Widget build(BuildContext context) {
    final int cost = intOf(widget.item['credit_cost']);
    final int days = _start != null && _end != null ? daysInclusive(_start!, _end!) : 0;
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(context.t('Borrow'), style: const TextStyle(fontSize: 13, color: HiColors.muted, fontWeight: FontWeight.w700)),
            Text(str(widget.item['title']), style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w800)),
            const SizedBox(height: 14),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(54), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)), foregroundColor: HiColors.ink),
              icon: const Icon(Icons.date_range),
              label: Text(_start == null ? context.t('Choose dates') : '${fmtRange(ymd(_start!), ymd(_end!), context.lang)}  ($days ${days == 1 ? context.t('day') : context.t('days')})'),
              onPressed: _pickDates,
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: HiColors.primarySoft, borderRadius: BorderRadius.circular(14)),
              child: Row(children: <Widget>[
                const Icon(Icons.star_rounded, color: HiColors.accent),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    cost == 0
                        ? context.t('This costs no credits.')
                        : '${context.t('Cost')}: ${costLabel(context, cost)}. ${context.t('Held now, returned if rejected or cancelled.')}',
                  ),
                ),
              ]),
            ),
            if (_error != null) ...<Widget>[
              const SizedBox(height: 10),
              Text(_error!, style: const TextStyle(color: HiColors.danger, fontWeight: FontWeight.w700)),
            ],
            const SizedBox(height: 16),
            PrimaryButton(label: context.t('Send request'), busy: _busy, onPressed: _send),
          ],
        ),
      ),
    );
  }
}
