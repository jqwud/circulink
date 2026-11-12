import 'package:flutter/material.dart';

import '../core/theme.dart';

/// The CircuLink mark: two arrows around a chain link (built by brand/build-icons.mjs).
/// Decoration only: screen readers skip it unless [semanticLabel] is given.
class BrandMark extends StatelessWidget {
  final double size;
  final String? semanticLabel;
  const BrandMark({super.key, this.size = 96, this.semanticLabel});

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'assets/brand/logo-mark.png',
      width: size,
      height: size,
      fit: BoxFit.contain,
      filterQuality: FilterQuality.high,
      semanticLabel: semanticLabel,
      excludeFromSemantics: semanticLabel == null,
    );
  }
}

/// The word "CircuLink": "Circu" in ink and "Link" in the brand green.
class BrandWordmark extends StatelessWidget {
  final double fontSize;
  const BrandWordmark({super.key, this.fontSize = 34});

  @override
  Widget build(BuildContext context) {
    final TextStyle base = TextStyle(fontSize: fontSize, fontWeight: FontWeight.w800, letterSpacing: -0.5, height: 1.1);
    return Text.rich(
      TextSpan(children: <TextSpan>[
        TextSpan(text: 'Circu', style: base.copyWith(color: HiColors.ink)),
        TextSpan(text: 'Link', style: base.copyWith(color: HiColors.primary)),
      ]),
      semanticsLabel: 'CircuLink',
      textAlign: TextAlign.center,
    );
  }
}
