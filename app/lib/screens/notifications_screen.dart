import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/notification_text.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

/// Everything the app told me, newest first. Opening the list marks everything read.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  bool _markedRead = false;

  Future<List<Map<String, dynamic>>> _load() async {
    final AppState app = context.app;
    final List<Map<String, dynamic>> list = listOf(await app.api.get('/notifications'));
    if (!_markedRead && list.any((Map<String, dynamic> n) => n['read_at'] == null)) {
      _markedRead = true;
      await app.api.post('/notifications/read-all');
      await app.refreshMe();
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    final AppState app = context.watch<AppState>();
    return Scaffold(
      appBar: hiAppBar(context.t('Notifications')),
      body: AsyncView<List<Map<String, dynamic>>>(
        refreshKey: app.version,
        loader: _load,
        builder: (BuildContext ctx, List<Map<String, dynamic>> list, Future<void> Function() reload) {
          return RefreshIndicator(
            onRefresh: reload,
            child: list.isEmpty
                ? ListView(children: <Widget>[const SizedBox(height: 60), EmptyState(message: ctx.t('Nothing yet. We will tell you when your items are processed.'))])
                : ListView.builder(
                    padding: const EdgeInsets.all(HiSpace.md),
                    itemCount: list.length,
                    itemBuilder: (BuildContext c, int i) {
                      final Map<String, dynamic> n = list[i];
                      final ({String title, String body}) text = notificationText(n, app.tr, app.lang);
                      return HiCard(
                        margin: const EdgeInsets.only(bottom: HiSpace.sm),
                        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
                          const Icon(Icons.notifications_none_rounded, color: HiColors.accent),
                          const SizedBox(width: HiSpace.ms),
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
                              Text(text.title, style: HiText.title),
                              if (text.body.isNotEmpty) Text(text.body),
                              const SizedBox(height: 4),
                              Text(fmtDate(str(n['created_at']), app.lang), style: HiText.caption),
                            ]),
                          ),
                        ]),
                      );
                    },
                  ),
          );
        },
      ),
    );
  }
}
