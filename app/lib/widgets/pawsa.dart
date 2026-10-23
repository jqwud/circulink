import 'package:flutter/material.dart';

/// Pawsa, the Hiraman mascot, as a sticker image.
/// Poses: happy, hero (welcome), point, wink, oops, sleepy, cheer, head (round badge).
/// Every pose uses the same frame and scale, so changing the pose never makes him jump.
/// He is decoration: screen readers skip him unless [semanticLabel] is given.
class PawsaImage extends StatelessWidget {
  final String pose;
  final double size;
  final String? semanticLabel;
  const PawsaImage({super.key, this.pose = 'happy', this.size = 96, this.semanticLabel});

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'assets/pawsa/pawsa-$pose.webp',
      width: size,
      height: size,
      fit: BoxFit.contain,
      filterQuality: FilterQuality.high,
      semanticLabel: semanticLabel,
      excludeFromSemantics: semanticLabel == null,
    );
  }
}
