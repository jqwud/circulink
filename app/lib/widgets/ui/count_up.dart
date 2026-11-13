import 'package:flutter/material.dart';

/// A number that counts up to its value when it first appears or changes, so a new total feels earned.
/// With the phone's "reduce motion" setting on, it shows the value straight away.
class CountUp extends StatelessWidget {
  final num value;
  final String Function(num v) format;
  final TextStyle? style;
  final Duration duration;

  const CountUp({
    super.key,
    required this.value,
    required this.format,
    this.style,
    this.duration = const Duration(milliseconds: 700),
  });

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.of(context).disableAnimations) return Text(format(value), style: style);
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 0, end: value.toDouble()),
      duration: duration,
      curve: Curves.easeOutCubic,
      // The final value is what screen readers hear, not every in-between number.
      builder: (BuildContext context, double v, Widget? _) => Semantics(
        label: format(value),
        excludeSemantics: true,
        child: Text(format(v == value ? value : v), style: style),
      ),
    );
  }
}

/// Kilograms the way people read them: whole numbers without decimals, others with one.
String formatKg(num kg) => kg == kg.roundToDouble() ? '${kg.toInt()} kg' : '${kg.toStringAsFixed(1)} kg';
