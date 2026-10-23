import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/i18n.dart';
import '../../core/theme.dart';

/// Who an item belongs to, at a glance: the Barangay (blue, hall icon) or a neighbor (purple, house icon).
/// Color, icon and word together, so it still reads in black and white and for color-blind people.
/// A screen reader says it first, before the item's name.
class OriginBadge extends StatelessWidget {
  final Map<String, dynamic> item;
  const OriginBadge({super.key, required this.item});

  static bool isBarangay(Map<String, dynamic> item) => str(item['origin']) == 'barangay' || boolOf(item['is_shelf']);

  @override
  Widget build(BuildContext context) {
    final bool brgy = isBarangay(item);
    final Color fg = brgy ? HiColors.info : HiColors.neighbor;
    final Color bg = brgy ? HiColors.infoSoft : HiColors.neighborSoft;
    final String label = brgy ? context.t('Barangay item') : context.t("Neighbor's item");
    return Semantics(
      label: label,
      child: ExcludeSemantics(
        child: Container(
          constraints: const BoxConstraints(minHeight: 28),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(HiRadius.pill)),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(brgy ? Icons.account_balance : Icons.home, size: 16, color: fg),
              const SizedBox(width: 6),
              Flexible(child: Text(label, style: TextStyle(color: fg, fontSize: 14, fontWeight: FontWeight.w800, height: 1.2))),
            ],
          ),
        ),
      ),
    );
  }
}

/// "Libre" (free to take): a donation. Dark text on sun yellow, with the gift-hand icon.
class FreeBadge extends StatelessWidget {
  const FreeBadge({super.key});

  static bool isDonation(Map<String, dynamic> item) => str(item['listing_type']) == 'donate';

  @override
  Widget build(BuildContext context) {
    final String label = context.t('Free to take');
    return Semantics(
      label: label,
      child: ExcludeSemantics(
        child: Container(
          constraints: const BoxConstraints(minHeight: 28),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(color: HiColors.sunSoft, borderRadius: BorderRadius.circular(HiRadius.pill)),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              const Icon(Icons.volunteer_activism, size: 16, color: HiColors.ink),
              const SizedBox(width: 6),
              Flexible(child: Text(label, style: const TextStyle(color: HiColors.ink, fontSize: 14, fontWeight: FontWeight.w800, height: 1.2))),
            ],
          ),
        ),
      ),
    );
  }
}
