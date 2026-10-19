import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import 'my_items_screen.dart';
import 'request_detail.dart';

/// M9-M10: what I borrow, requests for my items, and a shortcut to My Items.
class RequestsScreen extends StatelessWidget {
  const RequestsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Column(
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 8, 0),
            child: Row(
              children: <Widget>[
                Expanded(child: Text(context.t('Requests'), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: HiColors.ink))),
                TextButton.icon(
                  icon: const Icon(Icons.inventory_2_outlined, size: 18),
                  label: Text(context.t('My items')),
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (BuildContext c) => const MyItemsScreen())),
                ),
              ],
            ),
          ),
          TabBar(
            labelColor: HiColors.primary,
            unselectedLabelColor: HiColors.muted,
            indicatorColor: HiColors.primary,
            labelStyle: const TextStyle(fontWeight: FontWeight.w800),
            tabs: <Widget>[Tab(text: context.t('I am borrowing')), Tab(text: context.t('For my items'))],
          ),
          const Expanded(
            child: TabBarView(children: <Widget>[_RequestList(as: 'borrower'), _RequestList(as: 'owner')]),
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
