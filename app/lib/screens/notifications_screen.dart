import 'package:flutter/material.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import 'request_detail.dart';

/// M15: everything the app told me. Tapping a loan notice opens that request.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  bool _markedRead = false;

  static const Set<String> _noRequest = <String>{'wanted_offer', 'verification_new', 'verified', 'verification_rejected', 'announcement'};

  IconData _icon(String type) {
    switch (type) {
      case 'credit_earned':
        return Icons.stars_rounded;
      case 'request_new':
      case 'request_auto':
      case 'request_staff':
        return Icons.inbox;
      case 'request_approved':
      case 'handover':
      case 'return_confirmed':
        return Icons.check_circle_outline;
      case 'request_rejected':
      case 'dispute':
      case 'late_return':
      case 'overdue':
        return Icons.error_outline;
      case 'due_tomorrow':
      case 'due_today':
      case 'checkin_missed':
        return Icons.schedule;
      case 'checkin_alert':
      case 'checkin_problem':
        return Icons.error_outline;
      case 'borrower_returned':
        return Icons.assignment_return;
      case 'dispute_settled':
        return Icons.gavel;
      case 'message':
        return Icons.chat_bubble_outline;
      default:
        return Icons.notifications_none;
    }
  }

  Future<List<Map<String, dynamic>>> _load() async {
    final List<Map<String, dynamic>> rows = listOf(await context.app.api.get('/notifications'));
    if (!_markedRead && rows.any((Map<String, dynamic> n) => n['read_at'] == null)) {
      _markedRead = true;
      try {
        await context.app.api.post('/notifications/read');
        await context.app.refreshMe();
      } catch (_) {
        // Not important enough to interrupt the screen.
      }
    }
    return rows;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: hiAppBar(context.t('Notifications')),
      body: AsyncView<List<Map<String, dynamic>>>(
        loader: _load,
        builder: (BuildContext ctx, List<Map<String, dynamic>> rows, Future<void> Function() reload) {
          if (rows.isEmpty) {
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: <Widget>[const SizedBox(height: 60), EmptyState(message: ctx.t('Nothing yet. Pawsa will tell you when something happens.'))],
            );
          }
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: rows.map((Map<String, dynamic> n) {
              final String type = str(n['type']);
              final bool unread = n['read_at'] == null;
              final bool opens = n['ref_id'] != null && !_noRequest.contains(type);
              return HiCard(
                color: unread ? HiColors.primarySoft : Colors.white,
                borderColor: unread ? HiColors.primarySoft : HiColors.line,
                onTap: opens
                    ? () => Navigator.of(ctx).push(MaterialPageRoute<void>(builder: (BuildContext c) => RequestDetailScreen(requestId: intOf(n['ref_id']))))
                    : null,
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Icon(_icon(type), color: HiColors.accent),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(str(n['title']), style: const TextStyle(fontWeight: FontWeight.w800)),
                          if (str(n['body']).isNotEmpty) Text(str(n['body']), style: const TextStyle(color: HiColors.muted)),
                          const SizedBox(height: 2),
                          Text(fmtDate(str(n['created_at']), ctx.lang), style: const TextStyle(color: HiColors.muted, fontSize: 11)),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            }).toList(),
          );
        },
      ),
    );
  }
}
