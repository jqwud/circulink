import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/i18n.dart';
import '../../core/theme.dart';
import 'hi_card.dart';
import 'labels.dart';
import 'origin_badge.dart';
import 'status_chip.dart';
import 'tone.dart';

/// An item in a list: photo or category icon, name, owner and chips.
class ItemThumb extends StatelessWidget {
  final Map<String, dynamic> item;
  final double size;
  const ItemThumb({super.key, required this.item, this.size = 72});

  @override
  Widget build(BuildContext context) {
    final String photo = context.app.api.absolute(item['photo_url'] as String?);
    final String slug = str(mapOf(item['category'])['slug']);
    final Widget placeholder = Container(
      width: size,
      height: size,
      color: HiColors.primarySoft,
      child: Icon(categoryIcon(slug), color: HiColors.accent, size: size * 0.45),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: photo.isEmpty
          ? placeholder
          : Image.network(photo, width: size, height: size, fit: BoxFit.cover, excludeFromSemantics: true, errorBuilder: (BuildContext c, Object e, StackTrace? s) => placeholder),
    );
  }
}

class ItemCard extends StatelessWidget {
  final Map<String, dynamic> item;
  final VoidCallback onTap;
  const ItemCard({super.key, required this.item, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final bool shelf = boolOf(item['is_shelf']);
    final Map<String, dynamic> owner = mapOf(item['owner']);
    final Map<String, dynamic> pickup = mapOf(item['pickup_point']);
    final String tier = str(item['tier'], 'low');
    final String who = shelf ? context.t('At the barangay hall') : '${str(owner['name'])} · ${str(owner['purok'], '-')}';
    return HiCard(
      onTap: onTap,
      padding: const EdgeInsets.all(12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          ItemThumb(item: item),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Wrap(spacing: 6, runSpacing: 4, children: <Widget>[
                  OriginBadge(item: item),
                  if (FreeBadge.isDonation(item)) const FreeBadge(),
                ]),
                const SizedBox(height: 4),
                Text(str(item['title']), maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                const SizedBox(height: 2),
                Text(who, style: const TextStyle(color: HiColors.muted, fontSize: 13)),
                if (pickup.isNotEmpty) Text(str(pickup['name']), style: const TextStyle(color: HiColors.muted, fontSize: 12)),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: <Widget>[
                    if (!FreeBadge.isDonation(item)) StatusChip(tierLabel(context, tier), tone: tierTone(tier)),
                    if (!FreeBadge.isDonation(item)) StatusChip(costLabel(context, intOf(item['credit_cost'])), tone: Tone.muted),
                    if (boolOf(item['is_out'])) StatusChip(context.t('Borrowed'), tone: Tone.info),
                    if (boolOf(item['repair_reuse'])) StatusChip(context.t('Repair and Reuse'), tone: Tone.ok),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
