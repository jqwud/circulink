import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import '../widgets/pawsa.dart';
import 'item_detail.dart';
import 'kits_screen.dart';
import 'notifications_screen.dart';
import 'verification_screen.dart';
import 'wallet_screen.dart';

/// M4: the home tab. Greeting, credits, verification status, news, shelf, kits and new items.
class HomeTab extends StatelessWidget {
  final void Function(int) onGoTo;
  const HomeTab({super.key, required this.onGoTo});

  Future<Map<String, dynamic>> _load(BuildContext context) async {
    final api = context.app.api;
    final List<dynamic> results = await Future.wait<dynamic>(<Future<dynamic>>[
      api.get('/announcements'),
      api.get('/items', query: <String, String>{'shelf': '1'}),
      api.get('/items', query: <String, String>{'owner': 'others'}),
    ]);
    return <String, dynamic>{
      'news': listOf(results[0]),
      'shelf': listOf(results[1]),
      'items': listOf(results[2]).where((Map<String, dynamic> i) => !boolOf(i['is_shelf'])).take(6).toList(),
    };
  }

  @override
  Widget build(BuildContext context) {
    final AppState app = context.watch<AppState>();
    return AsyncView<Map<String, dynamic>>(
      refreshKey: app.version,
      loader: () => _load(context),
      builder: (BuildContext ctx, Map<String, dynamic> data, Future<void> Function() reload) {
        final List<Map<String, dynamic>> news = listOf(data['news']);
        final List<Map<String, dynamic>> shelf = listOf(data['shelf']);
        final List<Map<String, dynamic>> items = listOf(data['items']);
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: <Widget>[
            Row(
              children: <Widget>[
                const PawsaImage(pose: 'head', size: 52),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text('${ctx.t('Hello')}, ${app.firstName}!', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: HiColors.ink)),
                      Text(ctx.t('What do you need today?'), style: const TextStyle(color: HiColors.muted)),
                    ],
                  ),
                ),
                Stack(
                  children: <Widget>[
                    IconButton(
                      tooltip: ctx.t('Notifications'),
                      icon: const Icon(Icons.notifications_none, size: 28, color: HiColors.ink),
                      onPressed: () => Navigator.of(ctx).push(MaterialPageRoute<void>(builder: (BuildContext c) => const NotificationsScreen())),
                    ),
                    if (app.unread > 0)
                      Positioned(
                        right: 6,
                        top: 6,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                          decoration: BoxDecoration(color: HiColors.danger, borderRadius: BorderRadius.circular(99)),
                          child: Text('${app.unread}', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800)),
                        ),
                      ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 14),
            HiCard(
              gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: <Color>[HiColors.mint, HiColors.primary]),
              onTap: () => Navigator.of(ctx).push(MaterialPageRoute<void>(builder: (BuildContext c) => const WalletScreen())),
              child: Row(
                children: <Widget>[
                  const CircleAvatar(radius: 22, backgroundColor: HiColors.sun, child: Icon(Icons.star_rounded, color: HiColors.ink, size: 28)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(ctx.t('Your credits'), style: const TextStyle(color: HiColors.ink, fontWeight: FontWeight.w600)),
                        Text('${app.credits}', style: const TextStyle(color: HiColors.ink, fontSize: 30, fontWeight: FontWeight.w800, height: 1.1)),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.fromLTRB(12, 7, 6, 7),
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(HiRadius.pill), boxShadow: HiShadow.card),
                    child: Row(mainAxisSize: MainAxisSize.min, children: <Widget>[
                      Text(ctx.t('See history'), style: const TextStyle(color: HiColors.ink, fontWeight: FontWeight.w800, fontSize: 13)),
                      const Icon(Icons.chevron_right, color: HiColors.ink, size: 18),
                    ]),
                  ),
                ],
              ),
            ),
            if (!app.isApproved) _VerifyBanner(status: app.verification, reason: str(app.user?['reject_reason'])),
            if (news.isNotEmpty) ...<Widget>[
              SectionTitle(ctx.t('From your barangay')),
              ...news.take(2).map((Map<String, dynamic> n) => HiCard(
                    color: HiColors.infoSoft,
                    borderColor: HiColors.infoSoft,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Row(children: <Widget>[
                          const Icon(Icons.campaign, color: HiColors.info, size: 20),
                          const SizedBox(width: 8),
                          Expanded(child: Text(str(n['title']), style: const TextStyle(fontWeight: FontWeight.w800, color: HiColors.info))),
                        ]),
                        const SizedBox(height: 4),
                        Text(str(n['message'])),
                      ],
                    ),
                  )),
            ],
            SectionTitle(
              ctx.t('Barangay Shelf'),
              trailing: TextButton(onPressed: () => onGoTo(1), child: Text(ctx.t('See all'))),
            ),
            if (shelf.isEmpty)
              Padding(padding: const EdgeInsets.all(8), child: Text(ctx.t('Nothing on the shelf right now.'), style: const TextStyle(color: HiColors.muted)))
            else
              SizedBox(
                height: 150,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: shelf
                      .map((Map<String, dynamic> it) => GestureDetector(
                            onTap: () => openItem(ctx, intOf(it['id'])),
                            child: Container(
                              width: 130,
                              margin: const EdgeInsets.only(right: 10),
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(kRadius), border: Border.all(color: HiColors.line)),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: <Widget>[
                                  ItemThumb(item: it, size: 70),
                                  const SizedBox(height: 6),
                                  Text(str(it['title']), maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                                ],
                              ),
                            ),
                          ))
                      .toList(),
                ),
              ),
            SectionTitle(ctx.t('Event kits')),
            HiCard(
              color: HiColors.primarySoft,
              borderColor: HiColors.primarySoft,
              onTap: () => Navigator.of(ctx).push(MaterialPageRoute<void>(builder: (BuildContext c) => const KitsScreen())),
              child: Row(
                children: <Widget>[
                  const Icon(Icons.celebration, color: HiColors.accent, size: 30),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(ctx.t('Planning a party or wake?'), style: const TextStyle(fontWeight: FontWeight.w800)),
                        Text(ctx.t('Borrow chairs, tables and more in one go.'), style: const TextStyle(color: HiColors.muted, fontSize: 13)),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right),
                ],
              ),
            ),
            SectionTitle(ctx.t('New from neighbors'), trailing: TextButton(onPressed: () => onGoTo(1), child: Text(ctx.t('Browse')))),
            if (items.isEmpty)
              EmptyState(message: ctx.t('No listings yet. Be the first to share something!'))
            else
              ...items.map((Map<String, dynamic> it) => ItemCard(item: it, onTap: () => openItem(ctx, intOf(it['id'])))),
          ],
        );
      },
    );
  }
}

class _VerifyBanner extends StatelessWidget {
  final String status;
  final String reason;
  const _VerifyBanner({required this.status, required this.reason});

  @override
  Widget build(BuildContext context) {
    String title;
    String body;
    Tone tone;
    String? action;
    switch (status) {
      case 'pending':
        title = context.t('Waiting for verification');
        body = context.t('Barangay staff are checking your ID. You can browse in the meantime.');
        tone = Tone.warn;
        break;
      case 'rejected':
        title = context.t('Verification was not approved');
        body = reason.isEmpty ? context.t('Please send a clearer photo of your ID.') : reason;
        tone = Tone.bad;
        action = context.t('Send ID again');
        break;
      default:
        title = context.t('Verify your account');
        body = context.t('Send a photo of your ID so you can borrow and lend. You get 3 starter credits.');
        tone = Tone.info;
        action = context.t('Send my ID');
    }
    return HiCard(
      margin: const EdgeInsets.only(top: 12),
      color: toneBg(tone),
      borderColor: toneBg(tone),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(title, style: TextStyle(fontWeight: FontWeight.w900, color: toneFg(tone), fontSize: 16)),
          const SizedBox(height: 4),
          Text(body),
          if (action != null) ...<Widget>[
            const SizedBox(height: 10),
            PrimaryButton(
              label: action,
              onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (BuildContext c) => const VerificationScreen())),
            ),
          ],
        ],
      ),
    );
  }
}
