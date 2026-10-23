import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/i18n.dart';
import '../../core/theme.dart';
import 'feedback.dart';

/// Badges in an even grid: three equal tiles per row, earned ones bright, the rest muted with a lock.
/// Tiles grow taller with large text instead of cutting the name off. Tap one to see how to earn it.
class BadgeGrid extends StatelessWidget {
  final List<Map<String, dynamic>> badges;
  final Map<String, List<String>> text;
  final IconData Function(String) icon;
  const BadgeGrid({super.key, required this.badges, required this.text, required this.icon});

  @override
  Widget build(BuildContext context) {
    const double gap = 10;
    final List<Widget> tiles = badges.map((Map<String, dynamic> b) => _tile(context, b)).toList();
    return LayoutBuilder(builder: (BuildContext c, BoxConstraints box) {
      final double w = (box.maxWidth - gap * 2) / 3;
      return Column(children: <Widget>[
        for (int r = 0; r < tiles.length; r += 3)
          Padding(
            padding: const EdgeInsets.only(bottom: gap),
            // Tiles in a row share one height, the height of the tallest name.
            child: IntrinsicHeight(
              child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: <Widget>[
                for (int i = r; i < r + 3; i++) ...<Widget>[
                  if (i > r) const SizedBox(width: gap),
                  SizedBox(width: w, child: i < tiles.length ? tiles[i] : null),
                ],
              ]),
            ),
          ),
      ]);
    });
  }

  Widget _tile(BuildContext context, Map<String, dynamic> b) {
    final String key = str(b['key']);
    final bool earned = boolOf(b['earned']);
    final List<String> words = text[key] ?? <String>[key, ''];
    return Semantics(
      button: true,
      label: '${context.t(words[0])}, ${earned ? context.t('earned') : context.t('not yet earned')}',
      excludeSemantics: true,
      child: Material(
        color: earned ? HiColors.primarySoft : HiColors.surfaceMuted,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(HiRadius.lg),
          side: BorderSide(color: earned ? HiColors.primary : HiColors.line),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => pawsaDialog(context,
              pose: earned ? 'cheer' : 'sleepy', title: context.tx(words[0]), message: earned ? context.tx('You earned this badge!') : context.tx(words[1])),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(6, 12, 6, 10),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                CircleAvatar(
                  radius: 22,
                  backgroundColor: earned ? HiColors.card : HiColors.mutedSoft,
                  child: Icon(earned ? icon(key) : Icons.lock_outline, size: 24, color: earned ? HiColors.accent : HiColors.muted),
                ),
                const SizedBox(height: 8),
                Text(context.t(words[0]),
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, height: 1.2, color: earned ? HiColors.ink : HiColors.muted)),
                const Spacer(),
                const SizedBox(height: 4),
                Text(earned ? context.t('Earned') : context.t('Locked'),
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: earned ? HiColors.accent : HiColors.muted)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
