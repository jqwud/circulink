import 'package:flutter/material.dart';

import '../../core/theme.dart';

/// One tab of [PillNav].
class PillNavItem {
  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final int badge;
  const PillNavItem({required this.icon, required this.selectedIcon, required this.label, this.badge = 0});
}

/// The floating bottom bar: a white pill that hovers above the screen, where the open tab is a solid moss
/// pill with white text (6.1:1), so it is impossible to miss. Every tab keeps its label and a 56 px target.
class PillNav extends StatelessWidget {
  final List<PillNavItem> items;
  final int selected;
  final ValueChanged<int> onSelect;
  const PillNav({super.key, required this.items, required this.selected, required this.onSelect});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      minimum: const EdgeInsets.fromLTRB(HiSpace.md, 0, HiSpace.md, HiSpace.ms),
      child: Container(
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(
          color: HiColors.card,
          borderRadius: BorderRadius.circular(HiRadius.pill),
          border: Border.all(color: HiColors.line),
          boxShadow: HiShadow.float,
        ),
        child: Row(children: <Widget>[
          for (int i = 0; i < items.length; i++)
            Expanded(child: _PillTab(item: items[i], selected: i == selected, onTap: () => onSelect(i))),
        ]),
      ),
    );
  }
}

class _PillTab extends StatelessWidget {
  final PillNavItem item;
  final bool selected;
  final VoidCallback onTap;
  const _PillTab({required this.item, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final bool still = MediaQuery.of(context).disableAnimations;
    final Color fg = selected ? HiColors.onPrimary : HiColors.muted;
    Widget icon = Icon(selected ? item.selectedIcon : item.icon, color: fg, size: 22);
    if (item.badge > 0) {
      icon = Badge(label: Text('${item.badge}'), backgroundColor: HiColors.danger, child: icon);
    }
    return Semantics(
      button: true,
      selected: selected,
      label: item.label,
      excludeSemantics: true,
      child: Material(
        type: MaterialType.transparency,
        borderRadius: BorderRadius.circular(HiRadius.pill),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: AnimatedContainer(
            duration: still ? Duration.zero : const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            height: 56,
            decoration: BoxDecoration(
              color: selected ? HiColors.primary : Colors.transparent,
              borderRadius: BorderRadius.circular(HiRadius.pill),
            ),
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: <Widget>[
              icon,
              const SizedBox(height: 2),
              Text(
                item.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: HiText.caption.copyWith(color: fg, fontWeight: selected ? FontWeight.w700 : FontWeight.w600),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
