import 'package:flutter/material.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import '../widgets/date_range.dart';
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
    final bool available = str(item['status']) == 'available';
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
                    _line(Icons.person_outline, shelf ? context.t('Barangay Shelf') : '${str(owner['name'])} · ${str(owner['purok'], '-')}${rating != null ? '  ★ $rating' : ''}'),
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
        if (!mine)
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
    final int maxDays = context.app.rule('maxLoanDays', 14);
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
    final int maxDays = context.app.rule('maxLoanDays', 14);
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
