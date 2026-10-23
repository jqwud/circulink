import 'package:flutter/material.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import 'messages_screen.dart';

/// One claim on a free item (Hiraman 2.0, donations). The receiver and the donor each see what they can do
/// next; both tap to confirm the handover. The donor of a barangay-chosen item never sees who receives it.
class ClaimScreen extends StatefulWidget {
  final int claimId;
  const ClaimScreen({super.key, required this.claimId});

  @override
  State<ClaimScreen> createState() => _ClaimScreenState();
}

class _ClaimScreenState extends State<ClaimScreen> {
  int _reloadTick = 0;
  bool _busy = false;

  Future<void> _act(String action, {String? done, String? doneTitle, String? confirmTitle, String? confirmMessage, String? confirmLabel}) async {
    if (confirmTitle != null) {
      final bool ok = await confirmDialog(context, title: confirmTitle, message: confirmMessage ?? '', confirmLabel: confirmLabel ?? context.tx('Yes'), danger: true);
      if (!ok || !mounted) return;
    }
    setState(() => _busy = true);
    final AppState app = context.app;
    try {
      await app.api.post('/donations/claims/${widget.claimId}/$action');
      await app.bump();
      if (!mounted) return;
      setState(() => _reloadTick++);
      if (done != null) await pawsaDialog(context, pose: 'cheer', title: doneTitle ?? context.tx('Done!'), message: done);
    } catch (e) {
      if (mounted) showMessage(context, context.app.errorText(e), bad: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  static String _statusLabel(BuildContext c, String s) => switch (s) {
        'waiting' => c.t('Asked. The barangay will choose.'),
        'reserved' => c.t('Reserved'),
        'given' => c.t('Given'),
        'released' => c.t('Let go'),
        'cancelled' => c.t('Cancelled'),
        'no_show' => c.t('Missed pickup'),
        'problem' => c.t('Sent to the barangay'),
        _ => s,
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: hiAppBar(context.t('Free item')),
      body: AsyncView<Map<String, dynamic>>(
        refreshKey: _reloadTick,
        loader: () async => mapOf(await context.app.api.get('/donations/claims/${widget.claimId}')),
        builder: (BuildContext ctx, Map<String, dynamic> c, Future<void> Function() reload) => _body(ctx, c),
      ),
    );
  }

  Widget _body(BuildContext context, Map<String, dynamic> c) {
    final Map<String, dynamic> item = mapOf(c['item']);
    final Map<String, dynamic> point = mapOf(c['pickup_point']);
    final String status = str(c['status']);
    final String role = str(c['my_role']);
    final bool receiver = role == 'claimer';
    final bool donor = role == 'donor';
    final bool reserved = status == 'reserved';
    final bool delivery = boolOf(c['staff_delivery']);
    final String pickup = str(c['pickup_date']);
    final bool pickupPassed = pickup.isNotEmpty && pickup.compareTo(ymd(phToday())) < 0;

    final List<Widget> actions = <Widget>[];
    void add(Widget w) {
      if (actions.isNotEmpty) actions.add(const SizedBox(height: 8));
      actions.add(w);
    }

    if (reserved && receiver && !boolOf(c['claimer_confirmed'])) {
      add(PrimaryButton(
        label: context.t('I got it'), icon: Icons.check_circle_outline, busy: _busy,
        onPressed: () => _act('received', done: context.tx('Thank you! When the donor also confirms, it is yours.'), doneTitle: context.tx('Confirmed')),
      ));
      add(SoftButton(
        label: context.t('Problem with this item'), icon: Icons.report_problem_outlined,
        onPressed: _busy ? null : () => _act('problem', confirmTitle: context.tx('Not as described?'), confirmMessage: context.tx('Barangay staff will look at it. Do not confirm that you got it.'), confirmLabel: context.tx('Tell the barangay')),
      ));
      add(SoftButton(
        label: context.t("I can't pick it up"), icon: Icons.undo,
        onPressed: _busy ? null : () => _act('release', confirmTitle: context.tx('Let it go?'), confirmMessage: context.tx('It will be offered to other neighbors.'), confirmLabel: context.tx('Let it go')),
      ));
    }
    if (reserved && donor && !boolOf(c['donor_confirmed'])) {
      add(PrimaryButton(
        label: context.t('I gave it'), icon: Icons.volunteer_activism, busy: _busy,
        onPressed: () => _act('given', done: context.tx('Thank you for sharing! When they also confirm, it is done.'), doneTitle: context.tx('Confirmed')),
      ));
      if (pickupPassed) {
        add(SoftButton(
          label: context.t('They did not come'), icon: Icons.person_off_outlined,
          onPressed: _busy ? null : () => _act('no-show', confirmTitle: context.tx('They did not come?'), confirmMessage: context.tx('The item will be offered to others again.'), confirmLabel: context.tx('Yes, they did not come')),
        ));
      }
      add(SoftButton(
        label: context.t("I can't give it anymore"), icon: Icons.cancel_outlined,
        onPressed: _busy ? null : () => _act('cancel', confirmTitle: context.tx('Cancel this claim?'), confirmMessage: context.tx('The person who claimed it will be told. You can do this once a month.'), confirmLabel: context.tx('Yes, cancel')),
      ));
    }
    if (status == 'reserved' || status == 'given') {
      add(SoftButton(
        label: context.t('Send a message'), icon: Icons.chat_bubble_outline,
        onPressed: () async {
          await Navigator.of(context).push(MaterialPageRoute<void>(
            builder: (BuildContext x) => MessagesScreen(requestId: 0, claimId: widget.claimId, concernItemId: intOf(item['id']), title: str(item['title'])),
          ));
          if (mounted) setState(() => _reloadTick++);
        },
      ));
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: <Widget>[
        HiCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Wrap(spacing: 6, runSpacing: 6, children: <Widget>[
                OriginBadge(item: item),
                const FreeBadge(),
                StatusChip(_statusLabel(context, status), tone: status == 'given' ? Tone.ok : (reserved ? Tone.info : Tone.muted)),
              ]),
              const SizedBox(height: 10),
              Text(str(item['title']), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
              const Divider(height: 24),
              KeyValueRow(context.t('From'), str(mapOf(c['donor'])['name'])),
              KeyValueRow(context.t('To'), receiver ? context.t('You') : str(mapOf(c['claimer'])['name'])),
              if (point.isNotEmpty) KeyValueRow(context.t('Pickup'), '${str(point['name'])}${str(point['hours']).isEmpty ? '' : ' · ${str(point['hours'])}'}'),
              if (pickup.isNotEmpty) KeyValueRow(context.t('Pickup day'), fmtDate(pickup, context.lang)),
              if (delivery) KeyValueRow(context.t('Delivery'), context.t('Barangay staff bring it')),
              if (reserved) ...<Widget>[
                const SizedBox(height: 8),
                Text(
                  boolOf(c['donor_confirmed']) || boolOf(c['claimer_confirmed'])
                      ? context.t('One side has confirmed. It is done when both have.')
                      : context.t('When you meet, both of you tap to confirm.'),
                  style: const TextStyle(color: HiColors.muted),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),
        ...actions,
      ],
    );
  }
}
