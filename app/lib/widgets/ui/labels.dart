import 'package:flutter/material.dart';

import '../../core/i18n.dart';
import 'tone.dart';

/// Words and icons for categories, tiers, costs and request statuses.
IconData categoryIcon(String? slug) {
  switch (slug) {
    case 'party':
      return Icons.celebration;
    case 'tools':
      return Icons.build;
    case 'school':
      return Icons.school;
    case 'travel':
      return Icons.luggage;
    default:
      return Icons.category;
  }
}

String costLabel(BuildContext context, int cost) {
  if (cost == 0) return context.t('Free');
  return cost == 1 ? '1 ${context.t('credit')}' : '$cost ${context.t('credits')}';
}

String tierLabel(BuildContext context, String tier) {
  switch (tier) {
    case 'medium':
      return context.t('Owner approves');
    case 'high':
      return context.t('Barangay hall');
    default:
      return context.t('Quick borrow');
  }
}

Tone tierTone(String tier) {
  switch (tier) {
    case 'medium':
      return Tone.warn;
    case 'high':
      return Tone.bad;
    default:
      return Tone.ok;
  }
}

Tone statusTone(String status) {
  switch (status) {
    case 'pending':
      return Tone.warn;
    case 'approved':
      return Tone.ok;
    case 'handed_over':
      return Tone.info;
    case 'closed':
      return Tone.ok;
    case 'rejected':
    case 'disputed':
      return Tone.bad;
    default:
      return Tone.muted;
  }
}

String statusLabel(BuildContext context, String status) {
  switch (status) {
    case 'pending':
      return context.t('Waiting for approval');
    case 'approved':
      return context.t('Approved');
    case 'rejected':
      return context.t('Not approved');
    case 'cancelled':
      return context.t('Cancelled');
    case 'handed_over':
      return context.t('Borrowed');
    case 'closed':
      return context.t('Returned');
    case 'disputed':
      return context.t('Under review');
    case 'expired':
      return context.t('Expired');
    default:
      return status;
  }
}
