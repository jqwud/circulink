import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/i18n.dart';
import '../../core/theme.dart';
import 'hi_card.dart';
import 'labels.dart';
import 'status_chip.dart';
import 'tone.dart';

/// A request in a list: item, status, dates, the other person and what needs attention.
class RequestCard extends StatelessWidget {
  final Map<String, dynamic> request;
  final VoidCallback onTap;
  const RequestCard({super.key, required this.request, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final Map<String, dynamic> item = mapOf(request['item']);
    final Map<String, dynamic> owner = mapOf(request['owner']);
    final Map<String, dynamic> borrower = mapOf(request['borrower']);
    final String status = str(request['status']);
    final bool asOwner = request['my_role'] == 'owner';
    final String who = asOwner
        ? '${context.t('Borrower')}: ${str(borrower['name'])}'
        : '${context.t('Lender')}: ${owner.isEmpty ? context.t('Barangay') : str(owner['name'])}';
    return HiCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(child: Text(str(item['title']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
              StatusChip(statusLabel(context, status), tone: statusTone(status)),
            ],
          ),
          const SizedBox(height: 6),
          Text(fmtRange(str(request['start_date']), str(request['end_date']), context.lang), style: const TextStyle(color: HiColors.ink)),
          const SizedBox(height: 2),
          Text(who, style: const TextStyle(color: HiColors.muted, fontSize: 13)),
          if (boolOf(request['overdue'])) ...<Widget>[
            const SizedBox(height: 6),
            StatusChip(context.t('Overdue'), tone: Tone.bad),
          ],
          if (!asOwner && boolOf(mapOf(request['checkin'])['due_today'])) ...<Widget>[
            const SizedBox(height: 6),
            StatusChip(context.t('Check in today'), tone: Tone.warn),
          ],
          if (asOwner && status == 'handed_over' && str(request['borrower_returned_at']).isNotEmpty) ...<Widget>[
            const SizedBox(height: 6),
            StatusChip(context.t('Borrower says returned'), tone: Tone.info),
          ],
        ],
      ),
    );
  }
}
