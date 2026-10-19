import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import 'add_item_screen.dart';
import 'request_detail.dart';

/// M9: the items I share. Pause, resume or remove them.
class MyItemsScreen extends StatelessWidget {
  const MyItemsScreen({super.key});

  Future<void> _setStatus(BuildContext context, Map<String, dynamic> it, String status) async {
    try {
      await context.app.api.patch('/items/${it['id']}', <String, dynamic>{'status': status});
      await context.app.bump();
    } catch (e) {
      if (context.mounted) showMessage(context, context.app.errorText(e), bad: true);
    }
  }

  Future<void> _remove(BuildContext context, Map<String, dynamic> it) async {
    final bool ok = await confirmDialog(context, title: context.tx('Remove this item?'), message: context.tx('Neighbors will no longer see it.'), confirmLabel: context.tx('Remove'), danger: true);
    if (!ok || !context.mounted) return;
    try {
      await context.app.api.delete('/items/${it['id']}');
      await context.app.bump();
    } catch (e) {
      if (context.mounted) showMessage(context, context.app.errorText(e), bad: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppState app = context.watch<AppState>();
    return Scaffold(
      appBar: hiAppBar(context.t('My items')),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: HiColors.primary,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: Text(context.t('Share an item')),
        onPressed: () {
          if (!app.isApproved) {
            showMessage(context, context.tx('Verify your account first to share items.'), bad: true);
            return;
          }
          Navigator.of(context).push(MaterialPageRoute<void>(builder: (BuildContext c) => const AddItemScreen()));
        },
      ),
      body: AsyncView<List<Map<String, dynamic>>>(
        refreshKey: app.version,
        loader: () async => listOf(await context.app.api.get('/my/items')),
        builder: (BuildContext ctx, List<Map<String, dynamic>> items, Future<void> Function() reload) {
          if (items.isEmpty) {
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: <Widget>[
                const SizedBox(height: 60),
                EmptyState(pose: 'wink', message: ctx.t('You have not shared anything yet. Items that sit idle at home can help a neighbor.')),
              ],
            );
          }
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 90),
            children: items.map((Map<String, dynamic> it) {
              final Map<String, dynamic> loan = mapOf(it['current_request']);
              final bool paused = str(it['status']) == 'paused';
              return HiCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        ItemThumb(item: it, size: 64),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              Text(str(it['title']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                              const SizedBox(height: 6),
                              Wrap(spacing: 6, runSpacing: 4, children: <Widget>[
                                StatusChip(tierLabel(ctx, str(it['tier'])), tone: tierTone(str(it['tier']))),
                                if (paused) StatusChip(ctx.t('Paused'), tone: Tone.muted),
                              ]),
                            ],
                          ),
                        ),
                      ],
                    ),
                    if (loan.isNotEmpty) ...<Widget>[
                      const SizedBox(height: 10),
                      InkWell(
                        onTap: () => Navigator.of(ctx).push(MaterialPageRoute<void>(builder: (BuildContext c) => RequestDetailScreen(requestId: intOf(loan['id'])))),
                        child: Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(color: HiColors.warnSoft, borderRadius: BorderRadius.circular(12)),
                          child: Row(children: <Widget>[
                            const Icon(Icons.swap_horiz, color: HiColors.warn),
                            const SizedBox(width: 8),
                            Expanded(child: Text('${statusLabel(ctx, str(loan['status']))}: ${str(loan['borrower'])} · ${fmtRange(str(loan['start_date']), str(loan['end_date']), ctx.lang)}', style: const TextStyle(color: HiColors.warn, fontWeight: FontWeight.w700))),
                            const Icon(Icons.chevron_right, color: HiColors.warn),
                          ]),
                        ),
                      ),
                    ],
                    const SizedBox(height: 6),
                    Row(
                      children: <Widget>[
                        TextButton(onPressed: () => _setStatus(ctx, it, paused ? 'available' : 'paused'), child: Text(paused ? ctx.t('Resume') : ctx.t('Pause'))),
                        TextButton(onPressed: () => _remove(ctx, it), child: Text(ctx.t('Remove'), style: const TextStyle(color: HiColors.danger))),
                      ],
                    ),
                  ],
                ),
              );
            }).toList(),
          );
        },
      ),
    );
  }
}
