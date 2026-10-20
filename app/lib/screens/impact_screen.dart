import 'package:flutter/material.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import '../widgets/pawsa.dart';

/// M18: what the whole barangay has shared so far. Counts only, no guesses.
class ImpactScreen extends StatelessWidget {
  const ImpactScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: hiAppBar(context.t('Our community impact')),
      body: AsyncView<Map<String, dynamic>>(
        loader: () async => mapOf(await context.app.api.get('/impact')),
        builder: (BuildContext ctx, Map<String, dynamic> d, Future<void> Function() reload) {
          final dynamic rate = d['return_rate'];
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: <Widget>[
              const Center(child: PawsaImage(pose: 'cheer', size: 160)),
              const SizedBox(height: 8),
              Text(ctx.t('Together we have shared more and bought less.'), textAlign: TextAlign.center, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
              const SizedBox(height: 14),
              Row(children: <Widget>[
                _big(ctx.t('Completed loans'), '${intOf(d['completed_loans'])}'),
                _big(ctx.t('Items reused'), '${intOf(d['items_reused'])}'),
              ]),
              Row(children: <Widget>[
                _big(ctx.t('Verified neighbors'), '${intOf(d['verified_residents'])}'),
                _big(ctx.t('Items to borrow'), '${intOf(d['active_listings'])}'),
              ]),
              Row(children: <Widget>[
                _big(ctx.t('On-time returns'), rate == null ? '-' : '$rate%'),
                _big(ctx.t('Purchases avoided'), '${intOf(d['purchases_avoided'])}'),
              ]),
              const SizedBox(height: 8),
              Text(
                ctx.t('Purchases avoided only counts borrowers who answered "yes, I would have bought or rented it". We never guess.'),
                style: const TextStyle(color: HiColors.muted, fontSize: 12),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _big(String label, String value) {
    return Expanded(
      child: HiCard(
        margin: const EdgeInsets.all(4),
        child: Column(children: <Widget>[
          Text(value, style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900, color: HiColors.accent)),
          Text(label, textAlign: TextAlign.center, style: const TextStyle(color: HiColors.muted, fontSize: 13)),
        ]),
      ),
    );
  }
}
