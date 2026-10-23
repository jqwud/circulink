import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import '../widgets/language_toggle.dart';
import '../widgets/pawsa.dart';

/// M1: three short slides where Pawsa explains Hiraman.
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
      _Slide('hero', context.t('Borrow what you need'), context.t('Need a ladder, chairs or a calculator for a day? Ask a neighbor instead of buying.')),
      _Slide('happy', context.t("Lend what you don't use"), context.t('Share things that sit idle at home. Only verified neighbors can borrow from you.')),
      _Slide('cheer', context.t('Earn credits, be a good neighbor'), context.t('Get credits for every on-time lend and use them to borrow. Together we waste less.')),
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

/// One slide. Pawsa shrinks to the space available; on a phone held sideways he sits beside the text.
/// If the text still does not fit (very large text settings), the slide scrolls instead of cutting off.
Widget _slideView(_Slide s) {
  return LayoutBuilder(
    builder: (BuildContext context, BoxConstraints c) {
      final bool sideways = c.maxWidth > c.maxHeight * 1.3;
      final double art = (sideways ? c.maxHeight * 0.85 : c.maxHeight * 0.45).clamp(90.0, 250.0);
      final TextAlign align = sideways ? TextAlign.start : TextAlign.center;
      final Widget words = Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: sideways ? CrossAxisAlignment.start : CrossAxisAlignment.center,
        children: <Widget>[
          Text(s.title, textAlign: align, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: HiColors.ink)),
          const SizedBox(height: 12),
          Text(s.body, textAlign: align, style: const TextStyle(fontSize: 16, color: HiColors.muted, height: 1.4)),
        ],
      );
      final Widget content = sideways
          ? Row(children: <Widget>[PawsaImage(pose: s.pose, size: art), const SizedBox(width: 24), Expanded(child: words)])
          : Column(mainAxisSize: MainAxisSize.min, children: <Widget>[PawsaImage(pose: s.pose, size: art), const SizedBox(height: 20), words]);
      return SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: ConstrainedBox(constraints: BoxConstraints(minHeight: c.maxHeight), child: Center(child: content)),
      );
    },
  );
}

class _Slide {
  final String pose;
  final String title;
  final String body;
  const _Slide(this.pose, this.title, this.body);
}
