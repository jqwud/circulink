import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// Pawsa, the Hiraman mascot. Poses: happy, wink, oops, sleepy, cheer, head.
class PawsaImage extends StatelessWidget {
  final String pose;
  final double size;
  const PawsaImage({super.key, this.pose = 'happy', this.size = 96});

  @override
  Widget build(BuildContext context) {
    return SvgPicture.asset(
      'assets/pawsa/pawsa-$pose.svg',
      width: size,
      height: size,
      semanticsLabel: 'Pawsa the cat',
    );
  }
}
