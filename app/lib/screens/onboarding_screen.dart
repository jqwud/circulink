import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/theme.dart';
import '../widgets/brand_mark.dart';
import '../widgets/common.dart';
import '../widgets/language_toggle.dart';

/// Three short slides that explain CircuLink before sign-up.
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _controller = PageController();
  int _index = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _next() {
    if (_index < 2) {
      _controller.nextPage(duration: const Duration(milliseconds: 280), curve: Curves.easeOut);
    } else {
      context.app.finishOnboarding();
    }
  }

  @override
  Widget build(BuildContext context) {
    final List<_Slide> slides = <_Slide>[
      _Slide(null, context.t('Keep things in the loop'), context.t('Clothes, books, gadgets and bottles you no longer need still have value. Bring them to a hub instead of the trash.')),
      _Slide(Icons.scale_rounded, context.t('Weighed and sorted at the hub'), context.t('Staff decide what happens to each item: reuse, repair, recycle, or proper disposal.')),
      _Slide(Icons.eco_rounded, context.t('See the waste you prevented'), context.t('Reusable items go to shelters, schools and NGOs. You see the kilograms you kept out of the landfill.')),
    ];
    return Scaffold(
      backgroundColor: HiColors.cream,
      body: SafeArea(
        child: Column(
          children: <Widget>[
            const Padding(padding: EdgeInsets.all(12), child: Align(alignment: Alignment.centerRight, child: LanguageToggle())),
            Expanded(
              child: PageView(
                controller: _controller,
                onPageChanged: (int i) => setState(() => _index = i),
                children: slides.map(_slideView).toList(),
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List<Widget>.generate(
                3,
                (int i) => AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  margin: const EdgeInsets.all(4),
                  width: i == _index ? 26 : 9,
                  height: 9,
                  decoration: BoxDecoration(color: i == _index ? HiColors.accent : HiColors.line, borderRadius: BorderRadius.circular(9)),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(24),
              child: PrimaryButton(label: _index == 2 ? context.t('Get started') : context.t('Next'), onPressed: _next),
            ),
          ],
        ),
      ),
    );
  }
}

/// One slide. The picture shrinks to the space available; sideways it sits beside the text.
/// If the text still does not fit (very large text settings), the slide scrolls instead of cutting off.
Widget _slideView(_Slide s) {
  return LayoutBuilder(
    builder: (BuildContext context, BoxConstraints c) {
      final bool sideways = c.maxWidth > c.maxHeight * 1.3;
      final double art = (sideways ? c.maxHeight * 0.6 : c.maxHeight * 0.32).clamp(80.0, 180.0);
      final TextAlign align = sideways ? TextAlign.start : TextAlign.center;
      final Widget picture = s.icon == null
          ? BrandMark(size: art)
          : Container(
              width: art,
              height: art,
              decoration: const BoxDecoration(color: HiColors.primarySoft, shape: BoxShape.circle),
              child: Icon(s.icon, size: art * 0.5, color: HiColors.primary),
            );
      final Widget words = Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: sideways ? CrossAxisAlignment.start : CrossAxisAlignment.center,
        children: <Widget>[
          Text(s.title, textAlign: align, style: HiText.h1),
          const SizedBox(height: 12),
          Text(s.body, textAlign: align, style: HiText.body.copyWith(color: HiColors.muted)),
        ],
      );
      final Widget content = sideways
          ? Row(children: <Widget>[picture, const SizedBox(width: 24), Expanded(child: words)])
          : Column(mainAxisSize: MainAxisSize.min, children: <Widget>[picture, const SizedBox(height: 24), words]);
      return SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: ConstrainedBox(constraints: BoxConstraints(minHeight: c.maxHeight), child: Center(child: content)),
      );
    },
  );
}

class _Slide {
  final IconData? icon;
  final String title;
  final String body;
  const _Slide(this.icon, this.title, this.body);
}
