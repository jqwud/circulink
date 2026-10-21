import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

/// M12: credit balance, how credits work, and every change.
class WalletScreen extends StatelessWidget {
  const WalletScreen({super.key});

  String _reason(BuildContext c, String r) {
    switch (r) {
      case 'starter':
        return c.t('Welcome credits');
      case 'borrow_hold':
        return c.t('Held for a borrow request');
      case 'refund_rejected':
        return c.t('Returned: request not approved');
      case 'refund_cancelled':
        return c.t('Returned: request cancelled');
      case 'refund_expired':
        return c.t('Returned: request expired');
      case 'refund_item_removed':
        return c.t('Returned: item removed');
      case 'lend_reward':
        return c.t('Thanks for lending');
      case 'late_penalty':
        return c.t('Late return');
      default:
        return r.replaceAll('_', ' ');
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppState app = context.watch<AppState>();
    return Scaffold(
      appBar: hiAppBar(context.t('My credits')),
      body: AsyncView<Map<String, dynamic>>(
        refreshKey: app.version,
        loader: () async => mapOf(await context.app.api.get('/credits')),
        builder: (BuildContext ctx, Map<String, dynamic> data, Future<void> Function() reload) {
          final List<Map<String, dynamic>> ledger = listOf(data['ledger']);
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: <Widget>[
              HiCard(
                gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: <Color>[HiColors.mint, HiColors.primary]),
                child: Column(children: <Widget>[
                  Text(ctx.t('Balance'), style: const TextStyle(color: HiColors.ink, fontWeight: FontWeight.w600)),
                  Text('${intOf(data['balance'])}', style: const TextStyle(color: HiColors.ink, fontSize: 52, fontWeight: FontWeight.w800, height: 1.1)),
                ]),
              ),
              HiCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(ctx.t('How credits work'), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
                    const SizedBox(height: 8),
                    _tip(ctx.t('You start with 3 credits when the barangay verifies you.')),
                    _tip(ctx.t('Borrowing costs 1 credit (2 for valuable items). Barangay Shelf items are free.')),
                    _tip(ctx.t('Credits are held when you ask, and returned if the request is rejected or cancelled.')),
                    _tip(ctx.t('Lenders earn 1 credit after a good, on-time return.')),
                    _tip(ctx.t('A late return costs the borrower 1 credit.')),
                  ],
                ),
              ),
              SectionTitle(ctx.t('History')),
              if (ledger.isEmpty)
                EmptyState(message: ctx.t('No credit activity yet.'))
              else
                ...ledger.map((Map<String, dynamic> l) {
                  final int amount = intOf(l['amount']);
                  return HiCard(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    margin: const EdgeInsets.only(bottom: 8),
                    child: Row(children: <Widget>[
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
                          Text(_reason(ctx, str(l['reason'])), style: const TextStyle(fontWeight: FontWeight.w700)),
                          Text(fmtDate(str(l['created_at']), ctx.lang), style: const TextStyle(color: HiColors.muted, fontSize: 12)),
                        ]),
                      ),
                      Text(amount > 0 ? '+$amount' : '$amount', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: amount >= 0 ? HiColors.leaf : HiColors.danger)),
                    ]),
                  );
                }),
            ],
          );
        },
      ),
    );
  }

  Widget _tip(String text) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
          const Icon(Icons.check_circle, size: 18, color: HiColors.leaf),
          const SizedBox(width: 8),
          Expanded(child: Text(text)),
        ]),
      );
}
