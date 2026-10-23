import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import 'claim_screen.dart';
import 'my_items_screen.dart';
import 'request_detail.dart';

/// M9-M10: what I borrow, requests for my items, and a shortcut to My Items.
class RequestsScreen extends StatelessWidget {
  const RequestsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: Column(
        children: <Widget>[
          ScreenHeader(
            context.t('Requests'),
            trailing: TextButton.icon(
              icon: const Icon(Icons.inventory_2_outlined, size: 18),
              label: Text(context.t('My items')),
              onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (BuildContext c) => const MyItemsScreen())),
            ),
          ),
          TabBar(tabs: <Widget>[Tab(text: context.t('I am borrowing')), Tab(text: context.t('For my items')), Tab(text: context.t('Free items'))]),
          const Expanded(
            child: TabBarView(children: <Widget>[_RequestList(as: 'borrower'), _RequestList(as: 'owner'), _ClaimList()]),
          ),
        ],
      ),
    );
  }
}

class _RequestList extends StatelessWidget {
  final String as;
  const _RequestList({required this.as});

  @override
  Widget build(BuildContext context) {
    final AppState app = context.watch<AppState>();
    return AsyncView<List<Map<String, dynamic>>>(
      refreshKey: app.version,
      loader: () async => listOf(await context.app.api.get('/requests', query: <String, String>{'as': as})),
      builder: (BuildContext ctx, List<Map<String, dynamic>> rows, Future<void> Function() reload) {
        if (rows.isEmpty) {
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            children: <Widget>[
              const SizedBox(height: 50),
              EmptyState(
                message: as == 'borrower' ? ctx.t('You are not borrowing anything yet. Browse to find what you need.') : ctx.t('No one has asked for your items yet.'),
              ),
            ],
          );
        }
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: rows
              .map((Map<String, dynamic> r) => RequestCard(
                    request: r,
                    onTap: () => Navigator.of(ctx).push(MaterialPageRoute<void>(builder: (BuildContext c) => RequestDetailScreen(requestId: intOf(r['id'])))),
                  ))
              .toList(),
        );
      },
    );
  }
}

/// Free items I claimed or asked for, and the claims on things I give away.
class _ClaimList extends StatelessWidget {
  const _ClaimList();

  static String _status(BuildContext c, String s) => switch (s) {
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
    final AppState app = context.watch<AppState>();
    return AsyncView<List<Map<String, dynamic>>>(
      refreshKey: app.version,
      loader: () async => listOf(await context.app.api.get('/donations/mine')),
      builder: (BuildContext ctx, List<Map<String, dynamic>> rows, Future<void> Function() reload) {
        if (rows.isEmpty) {
          return ListView(physics: const AlwaysScrollableScrollPhysics(), children: <Widget>[
            const SizedBox(height: 50),
            EmptyState(message: ctx.t('No free items yet. Look for "Free to take" in Browse, or give something away.')),
          ]);
        }
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: rows.map((Map<String, dynamic> c) {
            final bool receiving = str(c['my_role']) == 'claimer';
            return HiCard(
              margin: const EdgeInsets.only(bottom: 10),
              onTap: () => Navigator.of(ctx).push(MaterialPageRoute<void>(builder: (BuildContext x) => ClaimScreen(claimId: intOf(c['id'])))),
              child: Row(children: <Widget>[
                Icon(receiving ? Icons.card_giftcard : Icons.volunteer_activism, color: HiColors.accent),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
                    Text(str(mapOf(c['item'])['title']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                    Text(receiving ? '${ctx.t('From')} ${str(mapOf(c['donor'])['name'])}' : '${ctx.t('To')} ${str(mapOf(c['claimer'])['name'])}',
                        style: const TextStyle(color: HiColors.muted, fontSize: 13)),
                    const SizedBox(height: 6),
                    StatusChip(_status(ctx, str(c['status'])), tone: str(c['status']) == 'given' ? Tone.ok : (str(c['status']) == 'reserved' ? Tone.info : Tone.muted)),
                  ]),
                ),
                const Icon(Icons.chevron_right, color: HiColors.muted),
              ]),
            );
          }).toList(),
        );
      },
    );
  }
}
