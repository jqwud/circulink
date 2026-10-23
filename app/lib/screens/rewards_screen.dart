import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

/// Tier names and colors for the Tiwala score.
String tierName(BuildContext c, String tier) => switch (tier) {
      'gold' => c.t('Gold'),
      'silver' => c.t('Silver'),
      'bronze' => c.t('Bronze'),
      _ => c.t('Starter'),
    };
Tone tierTone2(String tier) => switch (tier) { 'gold' => Tone.warn, 'silver' => Tone.info, 'bronze' => Tone.ok, _ => Tone.muted };

/// The Me tab's Tiwala card: my trust score (0 to 100), my tier and the one next step. Separate from credits;
/// it can never be spent. Opens My rewards.
class TiwalaCard extends StatelessWidget {
  const TiwalaCard({super.key});

  @override
  Widget build(BuildContext context) {
    final AppState app = context.watch<AppState>();
    return AsyncView<Map<String, dynamic>>(
      refreshKey: app.version,
      loader: () async => mapOf(await context.app.api.get('/me/tiwala')),
      builder: (BuildContext ctx, Map<String, dynamic> t, Future<void> Function() reload) {
        final dynamic score = t['score'];
        final String tier = str(t['tier'], 'starter');
        final Map<String, dynamic> next = mapOf(t['next']);
        String step = '';
        if (next.isNotEmpty) {
          final int loans = intOf(next['loans']);
          final int points = intOf(next['points']);
          step = loans > 0
              ? ctx.tv(loans == 1 ? '1 more loan returned on time to reach {tier}.' : '{n} more loans returned on time to reach {tier}.',
                  <String, Object>{'n': loans, 'tier': tierName(ctx, str(next['tier']))})
              : points > 0
                  ? ctx.tv('{n} more points to reach {tier}.', <String, Object>{'n': points, 'tier': tierName(ctx, str(next['tier']))})
                  : '';
        }
        return HiCard(
          onTap: () => Navigator.of(ctx).push(MaterialPageRoute<void>(builder: (BuildContext c) => const RewardsScreen())),
          child: Row(children: <Widget>[
            Semantics(
              label: '${ctx.t('Tiwala score')} ${score ?? '-'}',
              child: ExcludeSemantics(
                child: Container(
                  width: 64,
                  height: 64,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: HiColors.accent, width: 4)),
                  child: Text(score == null ? '-' : '$score', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: HiColors.ink)),
                ),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
                Row(children: <Widget>[
                  Text(ctx.t('Tiwala score'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  const SizedBox(width: 8),
                  StatusChip(tierName(ctx, tier), tone: tierTone2(tier)),
                ]),
                const SizedBox(height: 4),
                Text(step.isNotEmpty ? step : ctx.t('Lend reliably to earn rice and vegetables from local producers.'), style: const TextStyle(color: HiColors.muted, fontSize: 13)),
                const SizedBox(height: 4),
                Text(ctx.t('My rewards'), style: const TextStyle(color: HiColors.accent, fontWeight: FontWeight.w800)),
              ]),
            ),
            const Icon(Icons.chevron_right, color: HiColors.muted),
          ]),
        );
      },
    );
  }
}

/// My reward vouchers: choose a reward, then show the 6-digit code at the barangay hall.
class RewardsScreen extends StatefulWidget {
  const RewardsScreen({super.key});

  @override
  State<RewardsScreen> createState() => _RewardsScreenState();
}

class _RewardsScreenState extends State<RewardsScreen> {
  int _tick = 0;

  Future<void> _choose(Map<String, dynamic> voucher) async {
    final AppState app = context.app;
    final List<Map<String, dynamic>> catalog = listOf(await app.api.get('/rewards/catalog'));
    if (!mounted) return;
    if (catalog.isEmpty) {
      showMessage(context, context.tx('Nothing in stock right now. Please check again in a few days.'), bad: true);
      return;
    }
    final int? id = await showHiSheet<int>(context, title: context.tx('Choose your reward'), builder: (BuildContext sheet) {
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: <Widget>[
        for (final Map<String, dynamic> c in catalog)
          Padding(
            padding: const EdgeInsets.only(bottom: HiSpace.sm),
            child: SoftButton(
              label: '${str(c[sheet.lang == 'fil' ? 'name_fil' : 'name_en'])}${str(c['supplier']).isEmpty ? '' : ' · ${str(c['supplier'])}'}',
              icon: Icons.eco,
              onPressed: () => Navigator.pop(sheet, intOf(c['id'])),
            ),
          ),
      ]);
    });
    if (id == null || !mounted) return;
    try {
      await app.api.post('/vouchers/${voucher['id']}/choose', <String, dynamic>{'catalog_id': id});
      if (!mounted) return;
      await playDecision(context, Decision.approved);
      if (mounted) setState(() => _tick++);
    } catch (e) {
      if (mounted) showMessage(context, app.errorText(e), bad: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: hiAppBar(context.t('My rewards')),
      body: AsyncView<List<Map<String, dynamic>>>(
        refreshKey: _tick,
        loader: () async => listOf(await context.app.api.get('/me/vouchers')),
        builder: (BuildContext ctx, List<Map<String, dynamic>> vouchers, Future<void> Function() reload) {
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: <Widget>[
              const TiwalaCard(),
              const SizedBox(height: 12),
              Text(
                ctx.t('Every quarter, reliable lenders get vouchers for rice and fresh vegetables from local producers, paid for by the barangay: Bronze 1, Silver 2, Gold 3.'),
                style: const TextStyle(color: HiColors.muted),
              ),
              SectionTitle(ctx.t('My vouchers')),
              if (vouchers.isEmpty) EmptyState(message: ctx.t('No vouchers yet. Lend items that come back on time to reach a tier.')),
              for (final Map<String, dynamic> v in vouchers) _voucher(ctx, v),
            ],
          );
        },
      ),
    );
  }

  Widget _voucher(BuildContext ctx, Map<String, dynamic> v) {
    final String status = str(v['status']);
    final Map<String, dynamic> reward = mapOf(v['reward']);
    final String rewardName = str(reward[ctx.lang == 'fil' ? 'name_fil' : 'name_en']);
    final String code = str(v['code']);
    return HiCard(
      margin: const EdgeInsets.only(bottom: 10),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
        Row(children: <Widget>[
          StatusChip(tierName(ctx, str(v['tier'])), tone: tierTone2(str(v['tier']))),
          const SizedBox(width: 8),
          Expanded(child: Text(_statusText(ctx, status), style: const TextStyle(fontWeight: FontWeight.w800))),
        ]),
        if (rewardName.isNotEmpty) ...<Widget>[const SizedBox(height: 6), Text(rewardName, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800))],
        if (code.isNotEmpty && status == 'chosen') ...<Widget>[
          const SizedBox(height: 10),
          Text(ctx.t('Show this code at the barangay hall:'), style: const TextStyle(color: HiColors.muted)),
          Semantics(
            label: '${ctx.t('Code')} ${code.split('').join(' ')}',
            child: ExcludeSemantics(child: Text('${code.substring(0, 3)} ${code.substring(3)}', style: const TextStyle(fontSize: 36, fontWeight: FontWeight.w800, letterSpacing: 4))),
          ),
        ],
        if (['issued', 'chosen'].contains(status)) ...<Widget>[
          const SizedBox(height: 6),
          Text(ctx.tv('Collect by {date}.', <String, Object>{'date': fmtDate(str(v['expires_on']), ctx.lang)}), style: const TextStyle(color: HiColors.muted, fontSize: 13)),
          const SizedBox(height: 10),
          status == 'issued'
              ? PrimaryButton(label: ctx.t('Choose your reward'), icon: Icons.eco, onPressed: () => _choose(v))
              : SoftButton(label: ctx.t('Change my choice'), icon: Icons.swap_horiz, onPressed: () => _choose(v)),
        ],
      ]),
    );
  }

  static String _statusText(BuildContext c, String s) => switch (s) {
        'held' => c.t('Barangay staff are checking it (up to 2 working days).'),
        'issued' => c.t('Ready: choose your reward.'),
        'chosen' => c.t('Ready to collect.'),
        'given' => c.t('Received. Thank you for lending!'),
        'expired' => c.t('Expired.'),
        'cancelled' => c.t('Cancelled.'),
        _ => s,
      };
}
