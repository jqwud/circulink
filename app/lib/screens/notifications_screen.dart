import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/notification_text.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

/// The three kinds of notice, each with its own colour and icon so the list can be scanned at a glance.
enum _Kind { dropoff, system, warning }

_Kind _kindOf(String type) {
  switch (type) {
    case 'dropoff_received':
    case 'dropoff_sorted':
    case 'points_confirmed':
      return _Kind.dropoff;
    case 'points_cancelled':
    case 'release_declined':
    case 'certificate_declined':
    case 'certificate_revoked':
      return _Kind.warning;
    default:
      return _Kind.system;
  }
}

({IconData icon, Color fg, Color bg}) _look(String type) {
  if (type == 'points_confirmed') return (icon: Icons.stars_rounded, fg: HiColors.warn, bg: HiColors.sunSoft);
  if (type == 'certificate_issued') return (icon: Icons.workspace_premium_rounded, fg: HiColors.warn, bg: HiColors.sunSoft);
  switch (_kindOf(type)) {
    case _Kind.dropoff:
      return (icon: Icons.inventory_2_rounded, fg: HiColors.accent, bg: HiColors.primarySoft);
    case _Kind.warning:
      return (icon: Icons.error_outline_rounded, fg: HiColors.danger, bg: HiColors.dangerSoft);
    case _Kind.system:
      return (icon: Icons.campaign_outlined, fg: HiColors.info, bg: HiColors.infoSoft);
  }
}

/// Everything the app told me, newest first, [pageSize] at a time. Opening the list marks everything read;
/// the ones that were new keep a dot until the list is reloaded.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  static const int pageSize = 30;

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  bool _markedRead = false;
  List<Map<String, dynamic>> _list = <Map<String, dynamic>>[];
  bool _hasMore = false;
  bool _loadingMore = false;

  String _page(int offset) => '/notifications?limit=${NotificationsScreen.pageSize}&offset=$offset';

  Future<List<Map<String, dynamic>>> _load() async {
    final AppState app = context.app;
    final List<Map<String, dynamic>> list = listOf(await app.api.get(_page(0)));
    _list = list;
    _hasMore = list.length == NotificationsScreen.pageSize;
    if (!_markedRead && list.any((Map<String, dynamic> n) => n['read_at'] == null)) {
      _markedRead = true;
      await app.api.post('/notifications/read-all');
      await app.refreshMe();
    }
    return list;
  }

  Future<void> _loadMore() async {
    setState(() => _loadingMore = true);
    try {
      final List<Map<String, dynamic>> more = listOf(await context.app.api.get(_page(_list.length)));
      if (!mounted) return;
      setState(() {
        _list = <Map<String, dynamic>>[..._list, ...more];
        _hasMore = more.length == NotificationsScreen.pageSize;
      });
    } catch (e) {
      if (mounted) showMessage(context, context.app.errorText(e), bad: true);
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppState app = context.watch<AppState>();
    return Scaffold(
      appBar: hiAppBar(context.t('Notifications')),
      body: AsyncView<List<Map<String, dynamic>>>(
        refreshKey: app.version,
        loader: _load,
        builder: (BuildContext ctx, List<Map<String, dynamic>> _, Future<void> Function() reload) {
          final List<Map<String, dynamic>> list = _list;
          return RefreshIndicator(
            onRefresh: reload,
            child: list.isEmpty
                ? ListView(children: <Widget>[const SizedBox(height: 60), EmptyState(message: ctx.t('Nothing yet. We will tell you when your items are processed.'))])
                : ListView.builder(
                    padding: const EdgeInsets.all(HiSpace.md),
                    itemCount: list.length + 1,
                    itemBuilder: (BuildContext c, int i) {
                      if (i == list.length) {
                        if (!_hasMore) return const SizedBox(height: HiSpace.lg);
                        return Padding(
                          padding: const EdgeInsets.only(top: HiSpace.sm),
                          child: SoftButton(
                            label: _loadingMore ? ctx.t('Loading...') : ctx.t('Show older notifications'),
                            icon: Icons.expand_more_rounded,
                            onPressed: _loadingMore ? null : _loadMore,
                          ),
                        );
                      }
                      return _NoticeCard(n: list[i], app: app);
                    },
                  ),
          );
        },
      ),
    );
  }
}

class _NoticeCard extends StatelessWidget {
  final Map<String, dynamic> n;
  final AppState app;
  const _NoticeCard({required this.n, required this.app});

  @override
  Widget build(BuildContext context) {
    final ({String title, String body}) text = notificationText(n, app.tr, app.lang);
    final ({IconData icon, Color fg, Color bg}) look = _look(str(n['type']));
    final bool fresh = n['read_at'] == null;
    return HiCard(
      margin: const EdgeInsets.only(bottom: HiSpace.sm),
      color: fresh ? HiColors.mint : null,
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(color: look.bg, shape: BoxShape.circle),
          child: ExcludeSemantics(child: Icon(look.icon, color: look.fg, size: 22)),
        ),
        const SizedBox(width: HiSpace.ms),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
            Text(text.title, style: HiText.title),
            if (text.body.isNotEmpty) Text(text.body, style: HiText.body),
            const SizedBox(height: HiSpace.xs),
            Text(fmtDate(str(n['created_at']), app.lang), style: HiText.caption),
          ]),
        ),
        if (fresh)
          Semantics(
            label: context.t('New'),
            child: Container(
              width: 10,
              height: 10,
              margin: const EdgeInsets.only(top: 6, left: HiSpace.sm),
              decoration: const BoxDecoration(color: HiColors.primary, shape: BoxShape.circle),
            ),
          ),
      ]),
    );
  }
}
