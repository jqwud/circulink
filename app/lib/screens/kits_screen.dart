import 'package:flutter/material.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

/// M14: ready-made bundles for a party, wake, school event or trip.
class KitsScreen extends StatelessWidget {
  const KitsScreen({super.key});

  Future<void> _request(BuildContext context, Map<String, dynamic> kit) async {
    if (!context.app.isApproved) {
      showMessage(context, context.tx('Your account must be verified by the barangay first.'), bad: true);
      return;
    }
    final DateTime now = DateTime.now();
    final DateTime first = DateTime(now.year, now.month, now.day);
    final DateTimeRange? range = await showDateRangePicker(
      context: context,
      firstDate: first,
      lastDate: first.add(const Duration(days: 90)),
      helpText: context.tx('Choose borrow dates (up to 14 days)'),
    );
    if (range == null || !context.mounted) return;
    if (daysInclusive(range.start, range.end) > 14) {
      showMessage(context, context.tx('You can borrow for up to 14 days.'), bad: true);
      return;
    }
    try {
      final Map<String, dynamic> res = mapOf(await context.app.api.post('/kits/${kit['id']}/request', <String, dynamic>{
        'start_date': ymd(range.start),
        'end_date': ymd(range.end),
      }));
      await context.app.bump();
      if (!context.mounted) return;
      final int made = listOf(res['created']).length;
      final List<dynamic> missing = res['missing'] is List ? res['missing'] as List<dynamic> : <dynamic>[];
      String msg = '$made ${context.tx('requests were sent. Find them under Requests.')}';
      if (missing.isNotEmpty) msg += '\n\n${context.tx('Not available for those dates')}: ${missing.join(', ')}';
      await pawsaDialog(context, pose: 'cheer', title: context.tx('Kit requested'), message: msg);
      if (context.mounted) Navigator.pop(context);
    } catch (e) {
      if (context.mounted) showMessage(context, context.app.errorText(e), bad: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: hiAppBar(context.t('Event kits')),
      body: AsyncView<List<Map<String, dynamic>>>(
        loader: () async => listOf(await context.app.api.get('/kits')),
        builder: (BuildContext ctx, List<Map<String, dynamic>> kits, Future<void> Function() reload) {
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: <Widget>[
              Text(ctx.t('Ask for everything you need for an event in one tap. We pick the free items for your dates.'), style: const TextStyle(color: HiColors.muted)),
              const SizedBox(height: 12),
              ...kits.map((Map<String, dynamic> k) {
                final List<Map<String, dynamic>> lines = listOf(k['items']);
                return HiCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Row(children: <Widget>[
                        Text(str(k['emoji'], '🎉'), style: const TextStyle(fontSize: 30)),
                        const SizedBox(width: 10),
                        Expanded(child: Text(ctx.lang == 'fil' ? str(k['name_fil']) : str(k['name_en']), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18))),
                      ]),
                      if (str(k['description']).isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(str(k['description']), style: const TextStyle(color: HiColors.muted))),
                      const SizedBox(height: 8),
                      ...lines.map((Map<String, dynamic> l) => Padding(
                            padding: const EdgeInsets.symmetric(vertical: 2),
                            child: Row(children: <Widget>[
                              Icon(intOf(l['available']) > 0 ? Icons.check_circle : Icons.remove_circle_outline, size: 18, color: intOf(l['available']) > 0 ? HiColors.leaf : HiColors.muted),
                              const SizedBox(width: 8),
                              Expanded(child: Text(str(l['label']))),
                              Text('${intOf(l['available'])} ${ctx.t('available')}', style: const TextStyle(color: HiColors.muted, fontSize: 12)),
                            ]),
                          )),
                      const SizedBox(height: 10),
                      PrimaryButton(label: ctx.t('Request this kit'), onPressed: () => _request(ctx, k)),
                    ],
                  ),
                );
              }),
            ],
          );
        },
      ),
    );
  }
}
