import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'hi_card.dart';

/// A row that opens something: icon, label, optional second line, and a chevron. At least 56 px tall.
class HiListTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String? subtitle;
  final VoidCallback onTap;
  final bool danger;

  const HiListTile({super.key, required this.icon, required this.label, required this.onTap, this.subtitle, this.danger = false});

  @override
  Widget build(BuildContext context) {
    return HiCard(
      margin: const EdgeInsets.only(bottom: HiSpace.sm),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      onTap: onTap,
      child: Semantics(
        button: true,
        child: Row(children: <Widget>[
          Icon(icon, color: danger ? HiColors.danger : HiColors.accent),
          const SizedBox(width: HiSpace.ms),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(label, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: danger ? HiColors.danger : HiColors.ink)),
                if (subtitle != null) Text(subtitle!, style: HiText.caption),
              ],
            ),
          ),
          const ExcludeSemantics(child: Icon(Icons.chevron_right, color: HiColors.muted)),
        ]),
      ),
    );
  }
}

/// A label and its value, for details like dates, the other person or the condition at return.
/// On narrow screens or with large text the value moves under the label instead of being squeezed.
class KeyValueRow extends StatelessWidget {
  final String label;
  final String value;
  const KeyValueRow(this.label, this.value, {super.key});

  @override
  Widget build(BuildContext context) {
    final Text l = Text(label, style: const TextStyle(color: HiColors.muted));
    final Text v = Text(value, style: const TextStyle(fontWeight: FontWeight.w700));
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: LayoutBuilder(builder: (BuildContext c, BoxConstraints box) {
        final bool stacked = box.maxWidth < 300 || MediaQuery.textScalerOf(c).scale(1) > 1.3;
        if (stacked) return Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[l, v]);
        return Row(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[SizedBox(width: 120, child: l), Expanded(child: v)]);
      }),
    );
  }
}
