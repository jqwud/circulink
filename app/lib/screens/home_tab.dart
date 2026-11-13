import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/brand_mark.dart';
import '../widgets/common.dart';
import 'guide_screen.dart';
import 'notifications_screen.dart';

/// Home, in the order a resident cares about it: what I achieved (impact), what it earned me (points and
/// tier), what to do next (declare, find a hub, sorting guide), then how it all works.
class HomeTab extends StatefulWidget {
  final void Function(int tab) onGoTo;
  const HomeTab({super.key, required this.onGoTo});

  static const Map<String, String> badgeNames = <String, String>{'seed': 'Seed', 'sprout': 'Sprout', 'tree': 'Tree', 'forest': 'Forest'};

  @override
  State<HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends State<HomeTab> {
  int _version = -1;
  late Future<dynamic> _impact;

  @override
  Widget build(BuildContext context) {
    final AppState app = context.watch<AppState>();
    if (app.version != _version) {
      _version = app.version;
      // GET /me/impact once for both cards. A failure becomes null, which the cards show as "could not load".
      _impact = app.api.get('/me/impact').catchError((Object _) => null);
    }
    return RefreshIndicator(
      onRefresh: () => app.bump(),
      child: FutureBuilder<dynamic>(
        future: _impact,
        builder: (BuildContext context, AsyncSnapshot<dynamic> snap) {
          final bool loading = snap.connectionState != ConnectionState.done;
          final _Impact? impact = loading || snap.data == null ? null : _Impact.from(mapOf(snap.data));
          final bool isNew = impact != null && impact.kg == 0 && impact.pending == 0;
          return ListView(
            padding: const EdgeInsets.fromLTRB(HiSpace.gutter, HiSpace.md, HiSpace.gutter, HiSpace.xl),
            children: <Widget>[
              _Header(unread: app.unread, name: app.firstName),
              const SizedBox(height: HiSpace.lg),
              _ImpactHero(impact: impact, loading: loading),
              const SizedBox(height: HiSpace.md),
              _PointsCard(impact: impact, loading: loading, badges: app.badges),
              const SizedBox(height: HiSpace.lg),
              // What to do next: one main action, two lighter ones beside each other.
              PrimaryButton(label: context.t('Declare items'), icon: Icons.add_rounded, onPressed: () => widget.onGoTo(1)),
              const SizedBox(height: HiSpace.sm),
              Row(children: <Widget>[
                Expanded(child: SoftButton(label: context.t('Find a hub'), icon: Icons.place_outlined, onPressed: () => widget.onGoTo(2))),
                const SizedBox(width: HiSpace.sm),
                Expanded(
                  child: SoftButton(
                    label: context.t('Sorting guide'),
                    icon: Icons.menu_book_outlined,
                    onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (BuildContext c) => const GuideScreen())),
                  ),
                ),
              ]),
              const _Together(),
              const SizedBox(height: HiSpace.lg),
              _HowItWorks(expanded: isNew || impact == null),
            ],
          );
        },
      ),
    );
  }
}

/// The numbers from GET /me/impact.
class _Impact {
  final num kg;
  final num co2;
  final int items;
  final int confirmed;
  final int pending;
  final String badge;
  const _Impact(this.kg, this.co2, this.items, this.confirmed, this.pending, this.badge);

  factory _Impact.from(Map<String, dynamic> m) => _Impact(
        (m['kg_kept'] as num?) ?? 0,
        (m['co2e_avoided_kg'] as num?) ?? 0,
        intOf(m['items_sorted']),
        intOf(m['points_confirmed']),
        intOf(m['points_pending']),
        str(m['badge'], 'seed'),
      );
}

class _Header extends StatelessWidget {
  final int unread;
  final String name;
  const _Header({required this.unread, required this.name});

  @override
  Widget build(BuildContext context) {
    return Row(children: <Widget>[
      const BrandMark(size: 44),
      const SizedBox(width: HiSpace.ms),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
          Semantics(header: true, child: Text('${context.t('Hello')}, $name!', style: HiText.h1)),
          Text(context.t('Thank you for keeping things in use.'), style: HiText.caption),
        ]),
      ),
      IconButton(
        tooltip: context.t('Notifications'),
        onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (BuildContext c) => const NotificationsScreen())),
        icon: Badge(
          isLabelVisible: unread > 0,
          label: Text('$unread'),
          backgroundColor: HiColors.danger,
          child: const Icon(Icons.notifications_outlined),
        ),
      ),
    ]);
  }
}

/// The one number that matters most: kilograms kept out of the landfill. Everything else is smaller.
class _ImpactHero extends StatelessWidget {
  final _Impact? impact;
  final bool loading;
  const _ImpactHero({required this.impact, required this.loading});

  @override
  Widget build(BuildContext context) {
    final TextStyle onP = HiText.body.copyWith(color: HiColors.onPrimary);
    final _Impact? m = impact;
    return HiCard(
      color: HiColors.primary,
      borderColor: HiColors.primary,
      margin: EdgeInsets.zero,
      padding: const EdgeInsets.all(HiSpace.lg),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
        Row(children: <Widget>[
          const ExcludeSemantics(child: Icon(Icons.recycling_rounded, color: HiColors.onPrimary, size: 20)),
          const SizedBox(width: HiSpace.sm),
          Text(context.t('Your impact'), style: HiText.label.copyWith(color: HiColors.onPrimary)),
        ]),
        const SizedBox(height: HiSpace.sm),
        if (m == null)
          Text('–', style: HiText.display.copyWith(color: HiColors.onPrimary))
        else
          CountUp(value: m.kg, format: formatKg, style: HiText.display.copyWith(color: HiColors.onPrimary, fontSize: 40)),
        Text(context.t('kept in use and out of the landfill'), style: onP),
        const SizedBox(height: HiSpace.md),
        if (loading)
          const SizedBox(height: 20)
        else if (m == null)
          Text(context.t('Your numbers could not be loaded. Pull down to try again.'), style: onP)
        else if (m.kg == 0 && m.pending == 0)
          Text(context.t('Bring items to a hub to start. Your numbers grow after staff weigh them.'), style: onP)
        else
          Wrap(spacing: HiSpace.sm, runSpacing: HiSpace.sm, children: <Widget>[
            _HeroChip(icon: Icons.inventory_2_outlined, text: context.tv('{n} items handled', <String, Object>{'n': m.items})),
            if (m.co2 > 0) _HeroChip(icon: Icons.cloud_outlined, text: context.tv('About {n} kg CO2 avoided (estimate)', <String, Object>{'n': m.co2})),
          ]),
      ]),
    );
  }
}

class _HeroChip extends StatelessWidget {
  final IconData icon;
  final String text;
  const _HeroChip({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: HiSpace.ms, vertical: 6),
      decoration: BoxDecoration(color: HiColors.onPrimary.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(HiRadius.pill)),
      child: Row(mainAxisSize: MainAxisSize.min, children: <Widget>[
        ExcludeSemantics(child: Icon(icon, size: 16, color: HiColors.onPrimary)),
        const SizedBox(width: 6),
        Flexible(child: Text(text, style: HiText.label.copyWith(color: HiColors.onPrimary))),
      ]),
    );
  }
}

/// Points as proof, not money: confirmed points (checked by hub staff), points still waiting, and how far
/// the person is from the next tier (BADGES in server/src/rules.js, sent in /meta).
class _PointsCard extends StatelessWidget {
  final _Impact? impact;
  final bool loading;
  final List<Map<String, dynamic>> badges;
  const _PointsCard({required this.impact, required this.loading, required this.badges});

  @override
  Widget build(BuildContext context) {
    final _Impact? m = impact;
    final int confirmed = m?.confirmed ?? 0;
    Map<String, dynamic>? next;
    int floor = 0;
    for (final Map<String, dynamic> b in badges) {
      if (intOf(b['min']) > confirmed) {
        next = b;
        break;
      }
      floor = intOf(b['min']);
    }
    final double progress = next == null ? 1 : ((confirmed - floor) / (intOf(next['min']) - floor)).clamp(0, 1).toDouble();
    final String tier = context.t(HomeTab.badgeNames[m?.badge ?? 'seed'] ?? 'Seed');

    return HiCard(
      margin: EdgeInsets.zero,
      padding: const EdgeInsets.all(HiSpace.md),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
        Row(children: <Widget>[
          Container(
            width: 40,
            height: 40,
            decoration: const BoxDecoration(color: HiColors.sunSoft, shape: BoxShape.circle),
            child: const ExcludeSemantics(child: Icon(Icons.stars_rounded, color: HiColors.warn)),
          ),
          const SizedBox(width: HiSpace.ms),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
              Text(context.t('Your points'), style: HiText.label.copyWith(color: HiColors.muted)),
              if (m == null)
                Text('–', style: HiText.h1)
              else
                CountUp(value: confirmed, format: (num v) => '${v.round()}', style: HiText.h1),
            ]),
          ),
          _TierBadge(name: tier),
        ]),
        const SizedBox(height: HiSpace.ms),
        Row(children: <Widget>[
          const ExcludeSemantics(child: Icon(Icons.verified_rounded, size: 16, color: HiColors.leaf)),
          const SizedBox(width: 6),
          Expanded(child: Text(context.t('Every point is weighed and checked by hub staff.'), style: HiText.caption)),
        ]),
        if (m != null && m.pending > 0) ...<Widget>[
          const SizedBox(height: HiSpace.xs),
          Row(children: <Widget>[
            const ExcludeSemantics(child: Icon(Icons.hourglass_top_rounded, size: 16, color: HiColors.warn)),
            const SizedBox(width: 6),
            Expanded(child: Text(context.tv('{n} points pending until your items are handled', <String, Object>{'n': m.pending}), style: HiText.caption)),
          ]),
        ],
        const SizedBox(height: HiSpace.md),
        _TierProgress(value: m == null ? 0 : progress),
        const SizedBox(height: HiSpace.sm),
        Text(
          next == null
              ? context.t('You reached the highest tier. Thank you!')
              : context.tv('{n} more points to {badge}', <String, Object>{
                  'n': intOf(next['min']) - confirmed,
                  'badge': context.t(HomeTab.badgeNames[str(next['key'])] ?? ''),
                }),
          style: HiText.label,
        ),
      ]),
    );
  }
}

class _TierBadge extends StatelessWidget {
  final String name;
  const _TierBadge({required this.name});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: HiSpace.ms, vertical: 6),
      decoration: BoxDecoration(color: HiColors.sun, borderRadius: BorderRadius.circular(HiRadius.pill)),
      child: Row(mainAxisSize: MainAxisSize.min, children: <Widget>[
        const ExcludeSemantics(child: Icon(Icons.eco_rounded, size: 16, color: HiColors.ink)),
        const SizedBox(width: 4),
        Text(name, style: HiText.label),
      ]),
    );
  }
}

/// A rounded bar that fills to the person's progress toward the next tier.
class _TierProgress extends StatelessWidget {
  final double value;
  const _TierProgress({required this.value});

  @override
  Widget build(BuildContext context) {
    final bool still = MediaQuery.of(context).disableAnimations;
    return Semantics(
      label: context.t('Progress to the next tier'),
      value: '${(value * 100).round()}%',
      child: ClipRRect(
        borderRadius: BorderRadius.circular(HiRadius.pill),
        child: TweenAnimationBuilder<double>(
          tween: Tween<double>(begin: still ? value : 0, end: value),
          duration: const Duration(milliseconds: 800),
          curve: Curves.easeOutCubic,
          builder: (BuildContext context, double v, Widget? _) => LinearProgressIndicator(
            value: v,
            minHeight: 10,
            backgroundColor: HiColors.sunSoft,
            color: HiColors.sun,
          ),
        ),
      ),
    );
  }
}

/// What everyone kept in use together (GET /impact), so one person's drop-off feels part of something.
class _Together extends StatefulWidget {
  const _Together();

  @override
  State<_Together> createState() => _TogetherState();
}

class _TogetherState extends State<_Together> {
  int _version = -1;
  late Future<dynamic> _impact;

  @override
  Widget build(BuildContext context) {
    final AppState app = context.watch<AppState>();
    if (app.version != _version) {
      _version = app.version;
      _impact = app.api.get('/impact').catchError((Object _) => null);
    }
    return FutureBuilder<dynamic>(
      future: _impact,
      builder: (BuildContext context, AsyncSnapshot<dynamic> snap) {
        final Map<String, dynamic> m = mapOf(snap.data);
        final num kg = (m['kg_kept'] as num?) ?? 0;
        if (kg == 0) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.only(top: HiSpace.lg),
          child: HiCard(
            color: HiColors.sunSoft,
            margin: EdgeInsets.zero,
            child: Row(children: <Widget>[
              const ExcludeSemantics(child: Icon(Icons.groups_rounded, color: HiColors.ink, size: 32)),
              const SizedBox(width: HiSpace.ms),
              Expanded(
                child: Text(
                  context.tv('Together, {p} residents kept {kg} kg out of the landfill.', <String, Object>{
                    'p': intOf(m['residents']),
                    'kg': kg == kg.roundToDouble() ? kg.toInt() : kg,
                  }),
                  style: HiText.body,
                ),
              ),
            ]),
          ),
        );
      },
    );
  }
}

/// How CircuLink works, in three steps. Open for new residents; folded for people who already know it.
class _HowItWorks extends StatelessWidget {
  final bool expanded;
  const _HowItWorks({required this.expanded});

  @override
  Widget build(BuildContext context) {
    final List<Widget> steps = <Widget>[
      _Step(n: 1, icon: Icons.edit_note_rounded, title: context.t('Declare'), text: context.t('List what you no longer need and choose a hub. You get a drop-off code.')),
      _Step(n: 2, icon: Icons.storefront_rounded, title: context.t('Drop off'), text: context.t('Bring the items and show your code. Staff weigh and sort each one.')),
      _Step(n: 3, icon: Icons.eco_rounded, title: context.t('Grow'), text: context.t('Reusable items go to partner organizations. You earn verified points and grow from Seed to Forest.')),
    ];
    return HiCard(
      margin: EdgeInsets.zero,
      padding: EdgeInsets.zero,
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          initiallyExpanded: expanded,
          shape: const Border(),
          collapsedShape: const Border(),
          tilePadding: const EdgeInsets.symmetric(horizontal: HiSpace.md, vertical: HiSpace.xs),
          childrenPadding: const EdgeInsets.fromLTRB(HiSpace.md, 0, HiSpace.md, HiSpace.md),
          leading: const ExcludeSemantics(child: Icon(Icons.lightbulb_outline_rounded, color: HiColors.accent)),
          title: Text(context.t('How CircuLink works'), style: HiText.title),
          children: steps,
        ),
      ),
    );
  }
}

class _Step extends StatelessWidget {
  final int n;
  final IconData icon;
  final String title;
  final String text;
  const _Step({required this.n, required this.icon, required this.title, required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: HiSpace.ms),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
        Container(
          width: 40,
          height: 40,
          decoration: const BoxDecoration(color: HiColors.primarySoft, shape: BoxShape.circle),
          child: ExcludeSemantics(child: Icon(icon, color: HiColors.accent, size: 20)),
        ),
        const SizedBox(width: HiSpace.ms),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
            Text('$n. $title', style: HiText.title),
            Text(text, style: HiText.body.copyWith(color: HiColors.muted)),
          ]),
        ),
      ]),
    );
  }
}
