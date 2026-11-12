import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/brand_mark.dart';
import '../widgets/common.dart';
import 'notifications_screen.dart';

/// Home: a greeting, the person's impact (filled in once drop-offs exist), and how CircuLink works.
class HomeTab extends StatelessWidget {
  final void Function(int tab) onGoTo;
  const HomeTab({super.key, required this.onGoTo});

  @override
  Widget build(BuildContext context) {
    final AppState app = context.watch<AppState>();
    return RefreshIndicator(
      onRefresh: () => app.bump(),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(HiSpace.gutter, HiSpace.md, HiSpace.gutter, HiSpace.xl),
        children: <Widget>[
          Row(children: <Widget>[
            const BrandMark(size: 44),
            const SizedBox(width: HiSpace.ms),
            Expanded(child: Semantics(header: true, child: Text('${context.t('Hello')}, ${app.firstName}!', style: HiText.h1))),
            IconButton(
              tooltip: context.t('Notifications'),
              onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (BuildContext c) => const NotificationsScreen())),
              icon: Badge(
                isLabelVisible: app.unread > 0,
                label: Text('${app.unread}'),
                backgroundColor: HiColors.danger,
                child: const Icon(Icons.notifications_outlined),
              ),
            ),
          ]),
          const SizedBox(height: HiSpace.md),
          HiCard(
            color: HiColors.primary,
            borderColor: HiColors.primary,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
              Text(context.t('Your impact'), style: const TextStyle(color: HiColors.onPrimary, fontWeight: FontWeight.w700)),
              const SizedBox(height: HiSpace.sm),
              Row(children: <Widget>[
                Expanded(child: _Figure(value: '0 kg', label: context.t('kept in use'))),
                Expanded(child: _Figure(value: '0', label: context.t('points'))),
              ]),
              const SizedBox(height: HiSpace.sm),
              Text(context.t('Bring items to a hub to start. Your numbers grow after staff weigh them.'),
                  style: const TextStyle(color: HiColors.onPrimary, height: 1.35)),
            ]),
          ),
          SectionTitle(context.t('How CircuLink works')),
          _Step(n: 1, icon: Icons.edit_note_rounded, text: context.t('Declare the things you no longer need and choose a hub.')),
          _Step(n: 2, icon: Icons.qr_code_2_rounded, text: context.t('You get a 6-character drop-off code. Bring the items and show the code.')),
          _Step(n: 3, icon: Icons.scale_rounded, text: context.t('Hub staff weigh each item and decide: reuse, repair, recycle or reject.')),
          _Step(n: 4, icon: Icons.volunteer_activism_rounded, text: context.t('Reusable items go to partner organizations. Recyclables go to recyclers.')),
          _Step(n: 5, icon: Icons.eco_rounded, text: context.t('You earn points and see the kilograms you kept out of the landfill.')),
          const SizedBox(height: HiSpace.sm),
          InfoBanner(
            context.t('Points come only from hub staff after weighing. They cannot be transferred and have no cash value.'),
            icon: Icons.verified_user_outlined,
          ),
          SoftButton(label: context.t('Find a hub near you'), icon: Icons.place_outlined, onPressed: () => onGoTo(1)),
        ],
      ),
    );
  }
}

class _Figure extends StatelessWidget {
  final String value;
  final String label;
  const _Figure({required this.value, required this.label});

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
      Text(value, style: const TextStyle(color: HiColors.onPrimary, fontSize: 28, fontWeight: FontWeight.w800)),
      Text(label, style: const TextStyle(color: HiColors.onPrimary)),
    ]);
  }
}

class _Step extends StatelessWidget {
  final int n;
  final IconData icon;
  final String text;
  const _Step({required this.n, required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return HiCard(
      margin: const EdgeInsets.only(bottom: HiSpace.sm),
      padding: const EdgeInsets.all(14),
      child: Row(children: <Widget>[
        CircleAvatar(
          radius: 18,
          backgroundColor: HiColors.primarySoft,
          child: ExcludeSemantics(child: Icon(icon, color: HiColors.accent, size: 20)),
        ),
        const SizedBox(width: HiSpace.ms),
        Expanded(child: Text('$n. $text', style: HiText.body)),
      ]),
    );
  }
}
