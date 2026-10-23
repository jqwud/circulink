import 'package:flutter/material.dart';

import '../../core/theme.dart';

/// A heading inside a screen, with an optional action on the right.
class SectionTitle extends StatelessWidget {
  final String text;
  final Widget? trailing;
  const SectionTitle(this.text, {super.key, this.trailing});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, HiSpace.md, 2, HiSpace.sm),
      child: Row(
        children: <Widget>[
          Expanded(child: Text(text, style: HiText.title)),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}
