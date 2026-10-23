import 'package:flutter/material.dart';

import '../../core/theme.dart';

/// The heading at the top of a main tab (Requests, Wanted): a title, an optional sentence under it,
/// and an optional action on the right. Screen readers hear the title as a heading.
class ScreenHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? trailing;

  const ScreenHeader(this.title, {super.key, this.subtitle, this.trailing});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(HiSpace.md, HiSpace.ms, HiSpace.sm, HiSpace.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Semantics(header: true, child: Text(title, style: HiText.h1)),
                if (subtitle != null) Text(subtitle!, style: HiText.body.copyWith(color: HiColors.muted)),
              ],
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}
