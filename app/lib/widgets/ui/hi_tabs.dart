import 'package:flutter/material.dart';

import '../../core/theme.dart';

class HiTab {
  final String label;
  final int? count;
  const HiTab(this.label, {this.count});
}

/// Tabs at the top of a screen, shown as pills on a soft track. A tab can show a count (like waiting requests).
/// Each tab is at least 44 px tall and tells screen readers whether it is selected.
class HiTabs extends StatelessWidget {
  final List<HiTab> tabs;
  final int index;
  final ValueChanged<int> onChanged;

  const HiTabs({super.key, required this.tabs, required this.index, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: HiColors.surfaceMuted, borderRadius: BorderRadius.circular(HiRadius.pill)),
      child: Row(
        children: <Widget>[
          for (int i = 0; i < tabs.length; i++)
            Expanded(
              child: Semantics(
                button: true,
                selected: i == index,
                child: Material(
                  color: i == index ? HiColors.card : Colors.transparent,
                  borderRadius: BorderRadius.circular(HiRadius.pill),
                  elevation: i == index ? 1 : 0,
                  shadowColor: HiColors.ink.withValues(alpha: 0.2),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(HiRadius.pill),
                    onTap: () => onChanged(i),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(minHeight: 44),
                      child: Center(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: HiSpace.sm, vertical: 6),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: <Widget>[
                              Flexible(
                                child: Text(
                                  tabs[i].label,
                                  textAlign: TextAlign.center,
                                  style: TextStyle(fontWeight: i == index ? FontWeight.w800 : FontWeight.w600, color: i == index ? HiColors.ink : HiColors.muted),
                                ),
                              ),
                              if ((tabs[i].count ?? 0) > 0) ...<Widget>[
                                const SizedBox(width: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                                  decoration: BoxDecoration(color: HiColors.primary, borderRadius: BorderRadius.circular(HiRadius.pill)),
                                  child: Text('${tabs[i].count}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: HiColors.onPrimary)),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
