import 'package:flutter/material.dart';

import '../../core/theme.dart';

/// The basic surface: white on a soft shadow, or tinted and flat. A tappable card sinks slightly while
/// pressed, so a tap feels answered (not with "reduce motion" on).
class HiCard extends StatefulWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry margin;
  final VoidCallback? onTap;
  final Color? color;
  final Color? borderColor;
  final Gradient? gradient;

  const HiCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.margin = const EdgeInsets.only(bottom: 12),
    this.onTap,
    this.color,
    this.borderColor,
    this.gradient,
  });

  @override
  State<HiCard> createState() => _HiCardState();
}

class _HiCardState extends State<HiCard> {
  bool _down = false;

  /// White cards float on a soft shadow. Tinted cards sit flat.
  /// A border is drawn only when [borderColor] differs from the fill.
  @override
  Widget build(BuildContext context) {
    final BorderRadius radius = BorderRadius.circular(HiRadius.lg);
    final HiCard w = widget;
    final Color fill = w.color ?? HiColors.card;
    final bool tinted = fill != HiColors.card || w.gradient != null;
    final bool outlined = w.borderColor != null && w.borderColor != fill;
    final bool still = MediaQuery.of(context).disableAnimations;
    return Padding(
      padding: w.margin,
      child: AnimatedScale(
        scale: _down && !still ? 0.98 : 1,
        duration: const Duration(milliseconds: 120),
        curve: Curves.easeOut,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: w.gradient == null ? fill : null,
            gradient: w.gradient,
            borderRadius: radius,
            boxShadow: tinted ? null : HiShadow.card,
            border: outlined ? Border.all(color: w.borderColor!, width: 1.2) : null,
          ),
          child: Material(
            type: MaterialType.transparency,
            borderRadius: radius,
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              borderRadius: radius,
              onTap: w.onTap,
              onHighlightChanged: w.onTap == null ? null : (bool v) => setState(() => _down = v),
              child: SizedBox(width: double.infinity, child: Padding(padding: w.padding, child: w.child)),
            ),
          ),
        ),
      ),
    );
  }
}
