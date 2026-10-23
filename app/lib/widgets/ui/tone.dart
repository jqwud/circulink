import 'package:flutter/material.dart';

import '../../core/theme.dart';

/// Tones for chips and banners. Colour is never the only signal: every tone except grey also has an icon.
enum Tone { ok, warn, bad, info, muted }

Color toneBg(Tone t) {
  switch (t) {
    case Tone.ok:
      return HiColors.leafSoft;
    case Tone.warn:
      return HiColors.warnSoft;
    case Tone.bad:
      return HiColors.dangerSoft;
    case Tone.info:
      return HiColors.infoSoft;
    case Tone.muted:
      return HiColors.mutedSoft;
  }
}

Color toneFg(Tone t) {
  switch (t) {
    case Tone.ok:
      return HiColors.leaf;
    case Tone.warn:
      return HiColors.warn;
    case Tone.bad:
      return HiColors.danger;
    case Tone.info:
      return HiColors.info;
    case Tone.muted:
      return HiColors.muted;
  }
}

/// Colour is never the only signal: every tone except plain grey also carries an icon.
IconData? toneIcon(Tone t) {
  switch (t) {
    case Tone.ok:
      return Icons.check_rounded;
    case Tone.warn:
      return Icons.schedule_rounded;
    case Tone.bad:
      return Icons.error_outline_rounded;
    case Tone.info:
      return Icons.info_outline_rounded;
    case Tone.muted:
      return null;
  }
}
