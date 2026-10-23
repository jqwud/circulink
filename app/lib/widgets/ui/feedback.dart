import 'package:flutter/material.dart';

import '../../core/i18n.dart';
import '../../core/theme.dart';
import '../pawsa.dart';

/// Telling people what happened: a short message, a confirm step, or a Pawsa dialog for big moments.
void showMessage(BuildContext context, String text, {bool bad = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(text),
      backgroundColor: bad ? HiColors.danger : HiColors.ink,
      behavior: SnackBarBehavior.floating,
    ));
}

Future<bool> confirmDialog(BuildContext context, {required String title, required String message, required String confirmLabel, bool danger = false}) async {
  final bool? ok = await showDialog<bool>(
    context: context,
    builder: (BuildContext ctx) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: <Widget>[
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(ctx.tx('Cancel'))),
        TextButton(
          onPressed: () => Navigator.pop(ctx, true),
          child: Text(confirmLabel, style: TextStyle(color: danger ? HiColors.danger : HiColors.accent, fontWeight: FontWeight.w800)),
        ),
      ],
    ),
  );
  return ok == true;
}

/// "KASAMA" (companion): the lime sticker shown on success moments.
class KasamaBadge extends StatelessWidget {
  const KasamaBadge({super.key});

  @override
  Widget build(BuildContext context) {
    return Transform.rotate(
      angle: -0.05,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
        decoration: BoxDecoration(
          color: HiColors.primary,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: HiColors.ink, width: 2.5),
          boxShadow: HiShadow.card,
        ),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(Icons.wb_sunny_rounded, size: 17, color: HiColors.ink),
            SizedBox(width: 6),
            Text('KASAMA', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, letterSpacing: 1.4, color: HiColors.ink, height: 1.1)),
          ],
        ),
      ),
    );
  }
}

/// A dialog with Pawsa on top, used after an important action.
/// Happy outcomes (happy, hero, cheer) also get the KASAMA badge.
Future<void> pawsaDialog(BuildContext context, {required String pose, required String title, required String message}) {
  final bool celebrate = pose == 'cheer' || pose == 'happy' || pose == 'hero';
  return showDialog<void>(
    context: context,
    builder: (BuildContext ctx) => AlertDialog(
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          PawsaImage(pose: pose, size: 150),
          if (celebrate) Transform.translate(offset: const Offset(0, -14), child: const KasamaBadge()),
          SizedBox(height: celebrate ? 0 : 8),
          Text(title, textAlign: TextAlign.center, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Text(message, textAlign: TextAlign.center),
        ],
      ),
      actions: <Widget>[TextButton(onPressed: () => Navigator.pop(ctx), child: Text(ctx.tx('OK')))],
    ),
  );
}
