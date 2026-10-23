import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'tone.dart';

/// A small rounded label: a status, a tier or a cost.
class StatusChip extends StatelessWidget {
  final String label;
  final Tone tone;
  const StatusChip(this.label, {super.key, this.tone = Tone.muted});

  @override
  Widget build(BuildContext context) {
    final IconData? icon = toneIcon(tone);
    return Container(
      padding: EdgeInsets.fromLTRB(icon == null ? 10 : 8, 4, 10, 4),
      decoration: BoxDecoration(color: toneBg(tone), borderRadius: BorderRadius.circular(HiRadius.pill)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          if (icon != null) ...<Widget>[Icon(icon, size: 14, color: toneFg(tone)), const SizedBox(width: 4)],
          Flexible(child: Text(label, style: TextStyle(color: toneFg(tone), fontSize: 12, fontWeight: FontWeight.w700, height: 1.2))),
        ],
      ),
    );
  }
}
