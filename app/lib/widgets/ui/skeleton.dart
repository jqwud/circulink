import 'package:flutter/material.dart';

import '../../core/i18n.dart';
import '../../core/theme.dart';

/// Grey blocks in the shape of the cards that are about to appear, shown while a list loads.
/// Calmer than a spinner, and nothing jumps when the data arrives. There is no animation, so it is
/// also comfortable for people who turn motion off. Screen readers hear "Loading".
/// It takes only the height of its cards, so it also works inside a scrolling page (the Me tab's badges).
class SkeletonList extends StatelessWidget {
  final int count;
  const SkeletonList({super.key, this.count = 4});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: context.t('Loading...'),
      liveRegion: true,
      child: ExcludeSemantics(
        child: ListView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.all(HiSpace.md),
          itemCount: count,
          itemBuilder: (BuildContext c, int i) => const _SkeletonCard(),
        ),
      ),
    );
  }
}

class _SkeletonCard extends StatelessWidget {
  const _SkeletonCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: HiSpace.ms),
      padding: const EdgeInsets.all(HiSpace.ms),
      decoration: BoxDecoration(color: HiColors.card, borderRadius: BorderRadius.circular(HiRadius.lg), boxShadow: HiShadow.card),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SkeletonBox(width: 72, height: 72, radius: HiRadius.md),
          SizedBox(width: HiSpace.ms),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                FractionallySizedBox(widthFactor: 0.7, child: SkeletonBox(height: 16)),
                SizedBox(height: HiSpace.sm),
                FractionallySizedBox(widthFactor: 0.45, child: SkeletonBox(height: 12)),
                SizedBox(height: HiSpace.sm),
                FractionallySizedBox(widthFactor: 0.3, child: SkeletonBox(height: 20, radius: HiRadius.pill)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// One grey block. Use inside a custom placeholder when a list is not made of cards.
class SkeletonBox extends StatelessWidget {
  final double? width;
  final double height;
  final double radius;
  const SkeletonBox({super.key, this.width, required this.height, this.radius = HiRadius.sm});

  @override
  Widget build(BuildContext context) {
    return Container(width: width, height: height, decoration: BoxDecoration(color: HiColors.mutedSoft, borderRadius: BorderRadius.circular(radius)));
  }
}
