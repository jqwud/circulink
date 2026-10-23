import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import '../widgets/pawsa.dart';

/// The privacy notice (RA 10173), written once on the server in Filipino and English.
/// With [mustAccept] it is the gate for people who joined before the notice existed or changed.
class PrivacyScreen extends StatefulWidget {
  final bool mustAccept;
  const PrivacyScreen({super.key, this.mustAccept = false});

  @override
  State<PrivacyScreen> createState() => _PrivacyScreenState();
}

class _PrivacyScreenState extends State<PrivacyScreen> {
  bool _busy = false;

  Future<void> _accept() async {
    setState(() => _busy = true);
    final AppState app = context.app;
    try {
      await app.api.post('/me/privacy');
      await app.refreshMe();
    } catch (e) {
      if (mounted) showMessage(context, context.app.errorText(e), bad: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final String lang = context.lang;
    return Scaffold(
      appBar: widget.mustAccept ? null : hiAppBar(context.t('Privacy notice')),
      body: SafeArea(
        child: AsyncView<Map<String, dynamic>>(
          refreshKey: lang,
          loader: () async => mapOf(await context.app.api.get('/privacy', query: <String, String>{'lang': lang})),
          builder: (BuildContext ctx, Map<String, dynamic> notice, Future<void> Function() reload) {
            final Map<String, dynamic> dpo = mapOf(notice['dpo']);
            final List<String> contact = <String>[str(dpo['name']), str(dpo['email']), str(dpo['phone'])].where((String x) => x.isNotEmpty).toList();
            return ListView(
              padding: const EdgeInsets.all(20),
              children: <Widget>[
                if (widget.mustAccept) ...<Widget>[
                  const Center(child: PawsaImage(pose: 'point', size: 110)),
                  const SizedBox(height: 8),
                  Text(ctx.t('Before you continue'), textAlign: TextAlign.center, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 4),
                  Text(ctx.t('Please read how Hiraman uses your information.'), textAlign: TextAlign.center, style: const TextStyle(color: HiColors.muted)),
                  const SizedBox(height: 14),
                ],
                ...listOf(notice['sections']).map((Map<String, dynamic> s) => HiCard(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
                        Text(str(s['title']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                        const SizedBox(height: 4),
                        Text(str(s['body']), style: const TextStyle(height: 1.4)),
                      ]),
                    )),
                HiCard(
                  color: HiColors.infoSoft,
                  borderColor: HiColors.infoSoft,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
                    Text(ctx.t('Data Protection Officer'), style: const TextStyle(fontWeight: FontWeight.w800, color: HiColors.info)),
                    const SizedBox(height: 4),
                    Text(contact.isEmpty ? str(dpo['fallback']) : contact.join('\n'), style: const TextStyle(color: HiColors.info)),
                  ]),
                ),
                Text('${ctx.t('Version')} ${str(notice['version'])}', style: const TextStyle(color: HiColors.muted, fontSize: 12)),
                if (widget.mustAccept) ...<Widget>[
                  const SizedBox(height: 16),
                  PrimaryButton(label: ctx.t('I have read it and I agree'), busy: _busy, onPressed: _accept),
                  const SizedBox(height: 8),
                  SoftButton(label: ctx.t('Log out'), icon: Icons.logout, onPressed: _busy ? null : () => ctx.app.logout()),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

/// "My data": everything Hiraman holds about the person, with a button to copy it all.
class MyDataScreen extends StatelessWidget {
  const MyDataScreen({super.key});

  static const List<List<String>> _sections = <List<String>>[
    <String>['items', 'My listings'],
    <String>['requests_as_borrower', 'Things I asked to borrow'],
    <String>['requests_for_my_items', 'Requests for my items'],
    <String>['credit_history', 'Credit history'],
    <String>['checkins', 'Check-ins'],
    <String>['messages_sent', 'Messages I sent'],
    <String>['ratings_given', 'Ratings I gave'],
    <String>['ratings_received', 'Ratings I received'],
    <String>['reports_filed', 'Reports I filed'],
    <String>['wanted_posts', 'Wanted posts'],
    <String>['survey_answers', 'Survey answers'],
    <String>['notifications', 'Notifications'],
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: hiAppBar(context.t('My data')),
      body: AsyncView<Map<String, dynamic>>(
        loader: () async => mapOf(await context.app.api.get('/me/data')),
        builder: (BuildContext ctx, Map<String, dynamic> data, Future<void> Function() reload) {
          final Map<String, dynamic> p = mapOf(data['profile']);
          return ListView(
            padding: const EdgeInsets.all(16),
            children: <Widget>[
              Text(ctx.t('This is everything Hiraman keeps about you. Other people appear by first name only.'), style: const TextStyle(color: HiColors.muted)),
              const SizedBox(height: 10),
              HiCard(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
                  Text(ctx.t('Profile'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  const SizedBox(height: 6),
                  for (final MapEntry<String, dynamic> e in p.entries)
                    if (e.value != null && str(e.value).isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 2),
                        child: Text('${e.key.replaceAll('_', ' ')}: ${e.key.endsWith('_at') || e.key == 'joined' ? fmtDate(str(e.value), ctx.lang) : str(e.value)}'),
                      ),
                ]),
              ),
              HiCard(
                child: Column(children: <Widget>[
                  for (final List<String> s in _sections)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(children: <Widget>[
                        Expanded(child: Text(ctx.t(s[1]))),
                        Text('${listOf(data[s[0]]).length}', style: const TextStyle(fontWeight: FontWeight.w800)),
                      ]),
                    ),
                ]),
              ),
              PrimaryButton(
                label: ctx.t('Copy all my data'),
                icon: Icons.copy,
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: const JsonEncoder.withIndent('  ').convert(data)));
                  if (ctx.mounted) showMessage(ctx, ctx.tx('Copied. Paste it into a note or a message to keep it.'));
                },
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Asking for the account to be deleted, or taking that request back.
Future<void> askToDeleteAccount(BuildContext context) async {
  final bool requested = boolOf(context.app.user?['deletion_requested']);
  if (requested) {
    final bool ok = await confirmDialog(context,
        title: context.tx('Keep your account?'),
        message: context.tx('Your request to delete your account will be cancelled.'),
        confirmLabel: context.tx('Keep my account'));
    if (!ok || !context.mounted) return;
    final AppState app = context.app;
    try {
      await app.api.delete('/me/delete-request');
      await app.refreshMe();
      if (context.mounted) showMessage(context, context.tx('Your account stays. Welcome back!'));
    } catch (e) {
      if (context.mounted) showMessage(context, context.app.errorText(e), bad: true);
    }
    return;
  }
  final bool ok = await confirmDialog(context,
      title: context.tx('Delete your account?'),
      message: context.tx('The barangay will delete your name, contact details, ID photo and messages. Loans you are part of must be finished first. Your loan records stay without your name.'),
      confirmLabel: context.tx('Ask to delete'),
      danger: true);
  if (!ok || !context.mounted) return;
  final AppState app = context.app;
  try {
    await app.api.post('/me/delete-request');
    await app.refreshMe();
    if (context.mounted) showMessage(context, context.tx('Request sent. The barangay will delete your account soon.'));
  } catch (e) {
    if (context.mounted) showMessage(context, context.app.errorText(e), bad: true);
  }
}
