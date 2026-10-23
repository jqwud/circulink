import 'package:flutter/material.dart';

import '../../core/theme.dart';

/// The two buttons: PrimaryButton (one main action per screen) and SoftButton (everything else).
class PrimaryButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool busy;
  final bool danger;

  const PrimaryButton({super.key, required this.label, required this.onPressed, this.icon, this.busy = false, this.danger = false});

  @override
  Widget build(BuildContext context) {
    final ButtonStyle? style = danger ? FilledButton.styleFrom(backgroundColor: HiColors.danger, foregroundColor: Colors.white) : null;
    final Widget content = busy
        ? SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 3, color: danger ? Colors.white : HiColors.onPrimary))
        : (icon == null
            ? Text(label)
            : Row(mainAxisSize: MainAxisSize.min, children: <Widget>[Icon(icon, size: 20), const SizedBox(width: 8), Text(label)]));
    return SizedBox(
      width: double.infinity,
      child: FilledButton(style: style, onPressed: busy ? null : onPressed, child: content),
    );
  }
}

class SoftButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool expand;

  const SoftButton({super.key, required this.label, required this.onPressed, this.icon, this.expand = true});

  @override
  Widget build(BuildContext context) {
    final Widget content = icon == null
        ? Text(label)
        : Row(mainAxisSize: MainAxisSize.min, children: <Widget>[Icon(icon, size: 18), const SizedBox(width: 8), Flexible(child: Text(label))]);
    final Widget button = OutlinedButton(onPressed: onPressed, child: content);
    return expand ? SizedBox(width: double.infinity, child: button) : button;
  }
}
