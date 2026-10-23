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
    final Map<String, dynamic>? f = await showHiSheet<Map<String, dynamic>>(context, title: context.tx('What do you need?'), builder: (BuildContext s) => const _WantedSheet());
    if (f == null || !context.mounted) return;
    final AppState app = context.app;
    try {
      await app.api.post('/wanted', f);
      await app.bump();
      if (context.mounted) showMessage(context, context.tx('Posted. Neighbors can now offer to help.'));
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
    if (!fulfilled) {
      final bool ok = await confirmDialog(context, title: context.tx('Remove this post?'), message: context.tx('Neighbors will no longer see it.'), confirmLabel: context.tx('Remove'), danger: true);
      if (!ok || !context.mounted) return;
    }
    final AppState app = context.app;
    try {
      await app.api.patch('/wanted/${w['id']}/close', <String, dynamic>{'fulfilled': fulfilled});
      await app.bump();
      if (context.mounted) showMessage(context, fulfilled ? context.tx('Marked as found. Glad you got it!') : context.tx('Post removed.'));
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
        foregroundColor: HiColors.onPrimary,
        icon: const Icon(Icons.add),
        label: Text(context.t('I need something')),
        onPressed: () => _post(context),
      ),
      body: Column(
        children: <Widget>[
          ScreenHeader(context.t('Wanted'), subtitle: context.t('Can you lend what a neighbor needs?')),
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
                          Text(str(w['title']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
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

/// What is needed, details and an optional date. The sheet owns its text fields.
class _WantedSheet extends StatefulWidget {
  const _WantedSheet();

  @override
  State<_WantedSheet> createState() => _WantedSheetState();
}

class _WantedSheetState extends State<_WantedSheet> {
  final TextEditingController _title = TextEditingController();
  final TextEditingController _details = TextEditingController();
  DateTime? _needed;
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    _details.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final DateTime now = phToday();
    final DateTime? d = await showDatePicker(context: context, initialDate: now, firstDate: now, lastDate: now.add(const Duration(days: 90)));
    if (d != null && mounted) setState(() => _needed = d);
  }

  void _submit() {
    if (_title.text.trim().length < 2) {
      setState(() => _error = context.tx('Please enter the item name.'));
      return;
    }
    Navigator.pop(context, <String, dynamic>{
      'title': _title.text.trim(),
      'details': _details.text.trim().isEmpty ? null : _details.text.trim(),
      'needed_by': _needed == null ? null : ymd(_needed!),
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        HiTextField(controller: _title, label: context.t('For example: Ladder'), error: _error, maxLength: 120, textCapitalization: TextCapitalization.sentences),
        const SizedBox(height: HiSpace.ms),
        HiTextField(controller: _details, label: context.t('Details (optional)'), minLines: 2, maxLines: 3, maxLength: 300, textCapitalization: TextCapitalization.sentences),
        const SizedBox(height: HiSpace.ms),
        SoftButton(icon: Icons.event, label: _needed == null ? context.t('Needed by (optional)') : fmtDate(ymd(_needed!), context.lang), onPressed: _pickDate),
        const SizedBox(height: HiSpace.md),
        PrimaryButton(label: context.t('Post'), onPressed: _submit),
        const SizedBox(height: HiSpace.sm),
        SoftButton(label: context.t('Cancel'), onPressed: () => Navigator.pop(context)),
      ],
    );
  }
}
