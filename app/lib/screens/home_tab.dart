import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/brand_mark.dart';
import '../widgets/common.dart';
import 'notifications_screen.dart';

/// Home: a greeting, the person's impact and badge, and how CircuLink works.
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
          const ImpactCard(),
          PrimaryButton(label: context.t('Declare items'), icon: Icons.add_rounded, onPressed: () => onGoTo(1)),
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
          SoftButton(label: context.t('Find a hub near you'), icon: Icons.place_outlined, onPressed: () => onGoTo(2)),
        ],
      ),
    );
  }
}

/// Kilograms kept in use, points and the badge tier, from GET /me/impact. Reloads whenever the app bumps.
class ImpactCard extends StatefulWidget {
  const ImpactCard({super.key});

  static const Map<String, String> badgeNames = <String, String>{'seed': 'Seed', 'sprout': 'Sprout', 'tree': 'Tree', 'forest': 'Forest'};

  @override
  State<ImpactCard> createState() => _ImpactCardState();
}

class _ImpactCardState extends State<ImpactCard> {
  static const Map<String, String> badgeNames = ImpactCard.badgeNames;
  int _version = -1;
  late Future<dynamic> _impact;

  @override
  Widget build(BuildContext context) {
    final AppState app = context.watch<AppState>();
    if (app.version != _version) {
      _version = app.version;
      _impact = app.api.get('/me/impact').catchError((Object _) => null);
    }
    return FutureBuilder<dynamic>(
      future: _impact,
      builder: (BuildContext context, AsyncSnapshot<dynamic> snap) {
        final Map<String, dynamic> m = mapOf(snap.data);
        final num kg = (m['kg_kept'] as num?) ?? 0;
        final int confirmed = intOf(m['points_confirmed']);
        final int pending = intOf(m['points_pending']);
        final num co2 = (m['co2e_avoided_kg'] as num?) ?? 0;
        final String badge = str(m['badge'], 'seed');
        // The next tier, from /meta (BADGES in server/src/rules.js).
        Map<String, dynamic>? next;
        for (final Map<String, dynamic> b in app.badges) {
          if (intOf(b['min']) > confirmed) {
            next = b;
            break;
          }
        }
        const TextStyle onP = TextStyle(color: HiColors.onPrimary, height: 1.35);
        return HiCard(
          color: HiColors.primary,
          borderColor: HiColors.primary,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
            Row(children: <Widget>[
              Expanded(child: Text(context.t('Your impact'), style: const TextStyle(color: HiColors.onPrimary, fontWeight: FontWeight.w700))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(color: HiColors.sun, borderRadius: BorderRadius.circular(HiRadius.pill)),
                child: Row(mainAxisSize: MainAxisSize.min, children: <Widget>[
                  const Icon(Icons.eco_rounded, size: 16, color: HiColors.ink),
                  const SizedBox(width: 4),
                  Text(context.t(badgeNames[badge] ?? 'Seed'), style: const TextStyle(color: HiColors.ink, fontWeight: FontWeight.w800)),
                ]),
              ),
            ]),
            const SizedBox(height: HiSpace.sm),
            Row(children: <Widget>[
              Expanded(child: _Figure(value: '${kg == kg.roundToDouble() ? kg.toInt() : kg} kg', label: context.t('kept in use'))),
              Expanded(child: _Figure(value: '$confirmed', label: context.t('points'))),
            ]),
            const SizedBox(height: HiSpace.sm),
            if (kg == 0 && pending == 0)
              Text(context.t('Bring items to a hub to start. Your numbers grow after staff weigh them.'), style: onP)
            else ...<Widget>[
              if (co2 > 0) Text(context.tv('About {n} kg of CO2 avoided (estimate)', <String, Object>{'n': co2}), style: onP),
              if (pending > 0) Text(context.tv('{n} points pending until your items are handled', <String, Object>{'n': pending}), style: onP),
              if (next != null)
                Text(context.tv('{n} more points to {badge}', <String, Object>{'n': intOf(next['min']) - confirmed, 'badge': context.t(badgeNames[str(next['key'])] ?? '')}), style: onP),
            ],
          ]),
        );
      },
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
