import 'package:flutter/material.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/notification_text.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import 'request_detail.dart';
import 'claim_screen.dart';
import 'item_detail.dart';

/// M15: everything the app told me. Tapping a loan notice opens that request.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  bool _markedRead = false;

  static const Set<String> _noRequest = <String>{
    'wanted_offer', 'verification_new', 'verified', 'verification_rejected', 'announcement', 'item_removed', 'donation_withdrawn',
  };

  /// Notices about a donation claim open the claim; notices about a listing open the listing (their ref is
  /// the item, not a request); everything else opens the borrow request.
  static const Set<String> _claimTypes = <String>{
    'claim_new', 'claim_released', 'claim_cancelled', 'claim_no_show', 'claim_paused', 'claim_expired', 'claim_message',
    'donation_given', 'donation_chosen', 'donation_chosen_donor', 'donation_not_chosen', 'donate_paused',
  };
  static const Set<String> _itemTypes = <String>{'item_hidden', 'item_shown', 'item_flagged', 'donation_unclaimed', 'donation_to_shelf'};

  Widget _target(String type, int ref) {
    if (_claimTypes.contains(type)) return ClaimScreen(claimId: ref);
    if (_itemTypes.contains(type)) return ItemDetailScreen(itemId: ref);
    return RequestDetailScreen(requestId: ref);
  }

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
      case 'claim_message':
        return Icons.chat_bubble_outline;
      case 'claim_new':
      case 'donation_given':
      case 'donation_chosen':
      case 'donation_chosen_donor':
      case 'donation_unclaimed':
      case 'donation_to_shelf':
        return Icons.volunteer_activism;
      case 'item_hidden':
      case 'request_cancelled_by_staff':
        return Icons.visibility_off_outlined;
      case 'item_flagged':
        return Icons.shield_outlined;
      case 'item_shown':
        return Icons.visibility_outlined;
      default:
        return Icons.notifications_none;
    }
  }

  Future<List<Map<String, dynamic>>> _load() async {
    final AppState app = context.app;
    final List<Map<String, dynamic>> rows = listOf(await app.api.get('/notifications'));
    if (!_markedRead && rows.any((Map<String, dynamic> n) => n['read_at'] == null)) {
      _markedRead = true;
      try {
        await app.api.post('/notifications/read');
        await app.refreshMe();
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
              final ({String title, String body}) text = notificationText(n, ctx.app.tr, ctx.lang);
              final bool opens = n['ref_id'] != null && !_noRequest.contains(type);
              return HiCard(
                color: unread ? HiColors.primarySoft : Colors.white,
                borderColor: unread ? HiColors.primarySoft : HiColors.line,
                onTap: opens
                    ? () => Navigator.of(ctx).push(MaterialPageRoute<void>(builder: (BuildContext c) => _target(type, intOf(n['ref_id']))))
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
                          Text(text.title, style: const TextStyle(fontWeight: FontWeight.w800)),
                          if (text.body.isNotEmpty) Text(text.body, style: const TextStyle(color: HiColors.muted)),
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
