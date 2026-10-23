import 'package:flutter/material.dart';

import 'hi_card.dart';
import 'tone.dart';

/// A tinted note inside a screen. info: what happens next. warn: something to watch. ok: done. bad: a problem.
/// The icon repeats the meaning of the colour, so it never relies on colour alone.
class InfoBanner extends StatelessWidget {
  final String text;
  final Tone tone;
  final IconData? icon;
  final Widget? action;

  const InfoBanner(this.text, {super.key, this.tone = Tone.info, this.icon, this.action});

  @override
  Widget build(BuildContext context) {
    final Color fg = toneFg(tone);
    return HiCard(
      color: toneBg(tone),
      borderColor: toneBg(tone),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Icon(icon ?? toneIcon(tone) ?? Icons.info_outline_rounded, color: fg),
              const SizedBox(width: 10),
              Expanded(child: Text(text, style: TextStyle(color: fg, fontWeight: FontWeight.w600, height: 1.35))),
            ],
          ),
          if (action != null) ...<Widget>[const SizedBox(height: 10), action!],
        ],
      ),
    );
  }
}
