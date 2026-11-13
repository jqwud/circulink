import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/theme.dart';

/// An icon for each item category (the slugs in database/migrations/001_hubs_and_items.sql).
const Map<String, IconData> kCategoryIcons = <String, IconData>{
  'clothes': Icons.checkroom_rounded,
  'shoes_bags': Icons.shopping_bag_outlined,
  'books': Icons.menu_book_rounded,
  'school': Icons.backpack_outlined,
  'kitchen': Icons.soup_kitchen_outlined,
  'toys': Icons.toys_outlined,
  'furniture': Icons.chair_outlined,
  'appliances': Icons.blender_outlined,
  'ewaste': Icons.devices_other_outlined,
  'batteries': Icons.battery_charging_full_rounded,
  'plastic': Icons.local_drink_outlined,
  'cans': Icons.takeout_dining_outlined,
  'glass': Icons.wine_bar_outlined,
  'food': Icons.lunch_dining_outlined,
};

const Set<String> _recyclables = <String>{'plastic', 'cans', 'glass'};

/// The palette colours for a category: moss for things that get reused, gold for recyclables,
/// ochre for hazardous items (special handling) and pine for sealed food.
({Color bg, Color fg}) categoryTone(Map<String, dynamic> c) {
  if (boolOf(c['hazardous'])) return (bg: HiColors.warnSoft, fg: HiColors.warn);
  if (boolOf(c['food'])) return (bg: HiColors.infoSoft, fg: HiColors.info);
  if (_recyclables.contains(str(c['slug']))) return (bg: HiColors.sunSoft, fg: HiColors.warn);
  return (bg: HiColors.primarySoft, fg: HiColors.accent);
}

IconData categoryIcon(Map<String, dynamic> c) => kCategoryIcons[str(c['slug'])] ?? Icons.category_outlined;

/// A round category icon. With [label] it becomes a small tile with the name under the icon.
class CategoryIcon extends StatelessWidget {
  final Map<String, dynamic> category;
  final String name;
  final bool showLabel;
  final double size;
  const CategoryIcon({super.key, required this.category, required this.name, this.showLabel = false, this.size = 36});

  @override
  Widget build(BuildContext context) {
    final ({Color bg, Color fg}) tone = categoryTone(category);
    final Widget circle = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: tone.bg, shape: BoxShape.circle),
      child: Icon(categoryIcon(category), size: size * 0.5, color: tone.fg),
    );
    if (!showLabel) return Tooltip(message: name, child: Semantics(label: name, child: circle));
    return SizedBox(
      width: 76,
      child: Column(children: <Widget>[
        ExcludeSemantics(child: circle),
        const SizedBox(height: HiSpace.xs),
        Text(name, textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis, style: HiText.caption.copyWith(color: HiColors.ink)),
      ]),
    );
  }
}
