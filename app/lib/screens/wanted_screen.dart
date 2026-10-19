import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

/// M13: neighbors post what they need, others offer to help.
class WantedScreen extends StatelessWidget {
  const WantedScreen({super.key});

  Future<void> _post(BuildContext context) async {
    if (!context.app.isApproved) {
      showMessage(context, context.tx('Verify your account first to post.'), bad: true);
      return;
    }
    final TextEditingController title = TextEditingController();
    final TextEditingController details = TextEditingController();
    DateTime? needed;
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => StatefulBuilder(
        builder: (BuildContext ctx2, void Function(void Function()) setLocal) => AlertDialog(
          title: Text(ctx2.tx('What do you need?')),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: <Widget>[
              TextField(controller: title, decoration: InputDecoration(labelText: ctx2.tx('For example: Ladder'), border: const OutlineInputBorder())),
              const SizedBox(height: 10),
              TextField(controller: details, maxLines: 2, decoration: InputDecoration(labelText: ctx2.tx('Details (optional)'), border: const OutlineInputBorder())),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                icon: const Icon(Icons.event),
                label: Text(needed == null ? ctx2.tx('Needed by (optional)') : fmtDate(ymd(needed!), ctx2.lang)),
                onPressed: () async {
                  final DateTime now = DateTime.now();
                  final DateTime? d = await showDatePicker(context: ctx2, initialDate: now, firstDate: now, lastDate: now.add(const Duration(days: 90)));
                  if (d != null) setLocal(() => needed = d);
                },
              ),
            ]),
          ),
          actions: <Widget>[
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(ctx2.tx('Cancel'))),
            TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text(ctx2.tx('Post'), style: const TextStyle(fontWeight: FontWeight.w800))),
          ],
        ),
      ),
    );
    final String t = title.text.trim();
    final String d = details.text.trim();
    title.dispose();
    details.dispose();
    if (ok != true || !context.mounted) return;
    try {
      await context.app.api.post('/wanted', <String, dynamic>{'title': t, 'details': d.isEmpty ? null : d, 'needed_by': needed == null ? null : ymd(needed!)});
      await context.app.bump();
    } catch (e) {
      if (context.mounted) showMessage(context, context.app.errorText(e), bad: true);
    }
  }

  Future<void> _offer(BuildContext context, Map<String, dynamic> w) async {
    try {
      await context.app.api.post('/wanted/${w['id']}/offer');
      if (context.mounted) pawsaDialog(context, pose: 'cheer', title: context.tx('Thank you!'), message: context.tx('We told your neighbor you can help.'));
    } catch (e) {
      if (context.mounted) showMessage(context, context.app.errorText(e), bad: true);
    }
  }

  Future<void> _close(BuildContext context, Map<String, dynamic> w, bool fulfilled) async {
    try {
      await context.app.api.patch('/wanted/${w['id']}/close', <String, dynamic>{'fulfilled': fulfilled});
      await context.app.bump();
    } catch (e) {
      if (context.mounted) showMessage(context, context.app.errorText(e), bad: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppState app = context.watch<AppState>();
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: HiColors.primary,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: Text(context.t('I need something')),
        onPressed: () => _post(context),
      ),
      body: Column(
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Align(alignment: Alignment.centerLeft, child: Text(context.t('Wanted'), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: HiColors.ink))),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Align(alignment: Alignment.centerLeft, child: Text(context.t('Can you lend what a neighbor needs?'), style: const TextStyle(color: HiColors.muted))),
          ),
          Expanded(
            child: AsyncView<List<Map<String, dynamic>>>(
              refreshKey: app.version,
              loader: () async => listOf(await context.app.api.get('/wanted')),
              builder: (BuildContext ctx, List<Map<String, dynamic>> rows, Future<void> Function() reload) {
                if (rows.isEmpty) {
                  return ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: <Widget>[const SizedBox(height: 50), EmptyState(message: ctx.t('No one is asking for anything right now.'))],
                  );
                }
                return ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 90),
                  children: rows.map((Map<String, dynamic> w) {
                    final Map<String, dynamic> user = mapOf(w['user']);
                    final bool mine = boolOf(w['mine']);
                    return HiCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(str(w['title']), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17)),
                          if (str(w['details']).isNotEmpty) Padding(padding: const EdgeInsets.only(top: 2), child: Text(str(w['details']))),
                          const SizedBox(height: 4),
                          Text(
                            '${str(user['name'])} · ${str(user['purok'], '-')}${str(w['needed_by']).isEmpty ? '' : '  ·  ${ctx.t('Needed by')} ${fmtDate(str(w['needed_by']), ctx.lang)}'}',
                            style: const TextStyle(color: HiColors.muted, fontSize: 13),
                          ),
                          const SizedBox(height: 8),
                          if (mine)
                            Row(children: <Widget>[
                              TextButton(onPressed: () => _close(ctx, w, true), child: Text(ctx.t('I got it'))),
                              TextButton(onPressed: () => _close(ctx, w, false), child: Text(ctx.t('Remove'), style: const TextStyle(color: HiColors.danger))),
                            ])
                          else
                            SoftButton(label: ctx.t('I can lend this'), icon: Icons.volunteer_activism, expand: false, onPressed: () => _offer(ctx, w)),
                        ],
                      ),
                    );
                  }).toList(),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
