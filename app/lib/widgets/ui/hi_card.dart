import 'package:flutter/material.dart';

import '../../core/theme.dart';

/// The basic surface: white on a soft shadow, or tinted and flat.
class HiCard extends StatelessWidget {
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

  /// White cards float on a soft shadow. Tinted cards sit flat.
  /// A border is drawn only when [borderColor] differs from the fill.
  @override
  Widget build(BuildContext context) {
    final BorderRadius radius = BorderRadius.circular(HiRadius.lg);
    final Color fill = color ?? HiColors.card;
    final bool tinted = fill != HiColors.card || gradient != null;
    final bool outlined = borderColor != null && borderColor != fill;
    return Padding(
      padding: margin,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: gradient == null ? fill : null,
          gradient: gradient,
          borderRadius: radius,
          boxShadow: tinted ? null : HiShadow.card,
          border: outlined ? Border.all(color: borderColor!, width: 1.2) : null,
        ),
        child: Material(
          type: MaterialType.transparency,
          borderRadius: radius,
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            borderRadius: radius,
            onTap: onTap,
            child: SizedBox(width: double.infinity, child: Padding(padding: padding, child: child)),
          ),
        ),
      ),
    );
  }
}
