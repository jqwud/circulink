import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

/// The sorting guide (SDG target 12.8): how to get items ready, what each outcome means, and tips for each
/// category the hubs accept. Categories come from the server, so a new one shows up with the general tip.
class GuideScreen extends StatelessWidget {
  const GuideScreen({super.key});

  /// Tips for the categories in the starting data (database/migrations), by slug.
  static const Map<String, String> tips = <String, String>{
    'clothes': 'Wash and fold them. Torn clothes are fine: they are recycled into rags.',
    'shoes_bags': 'Tie shoes together in pairs. Empty every pocket.',
    'books': 'Keep books dry. Loose paper goes in a bundle, without plastic or staples where you can.',
    'school': 'Pens that still write, notebooks with clean pages, bags that close.',
    'kitchen': 'Wash them. Wrap glass and anything sharp in newspaper.',
    'toys': 'Clean, with all their parts. Take the batteries out and bring them as Batteries.',
    'furniture': 'Small pieces only, that one person can carry. Ask the hub first for anything big.',
    'appliances': 'Say whether it still works. Broken ones may be repaired.',
    'ewaste': 'Delete your data and take out SIM and memory cards first. Never put these in the trash.',
    'batteries': 'Tape the ends of each battery. Never put a swollen or leaking battery in a bag with others.',
    'plastic': 'Rinse, empty and flatten them. Caps on.',
    'cans': 'Rinse and empty them. Crushed is fine.',
    'glass': 'Rinse them. Broken glass wrapped in newspaper, and tell the staff.',
    'food': 'Sealed packs only, good for at least 3 more days. No home-cooked food.',
  };

  @override
  Widget build(BuildContext context) {
    final AppState app = context.watch<AppState>();
    return Scaffold(
      appBar: AppBar(title: Text(context.t('Sorting guide'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(HiSpace.gutter, HiSpace.md, HiSpace.gutter, HiSpace.xl),
        children: <Widget>[
          Text(context.t('A little care at home means more of your items can be used again.'), style: HiText.body),
          SectionTitle(context.t('Before you go')),
          _Tip(icon: Icons.cleaning_services_outlined, text: context.t('Clean and dry: washed clothes, rinsed bottles and cans.')),
          _Tip(icon: Icons.category_outlined, text: context.t('Group items by kind, so staff can weigh them quickly.')),
          _Tip(icon: Icons.lock_outline, text: context.t('Remove personal things: photos, IDs, SIM and memory cards.')),
          SectionTitle(context.t('What happens at the hub')),
          _Outcome(color: HiColors.primary, title: context.t('Reuse'), text: context.t('Good as it is. It goes to a partner organization such as a shelter or school. Full points.')),
          _Outcome(color: HiColors.info, title: context.t('Repair'), text: context.t('Needs a small fix first, then it is reused. 80% of the points.')),
          _Outcome(color: HiColors.sun, title: context.t('Recycle'), text: context.t('Its material is recovered by a recycler. Half the points.')),
          _Outcome(color: HiColors.lineStrong, title: context.t('Not accepted'), text: context.t('Dirty, unsafe or not something hubs take. No points, but staff dispose of it properly.')),
          SectionTitle(context.t('By category')),
          for (final Map<String, dynamic> c in app.categories)
            HiCard(
              margin: const EdgeInsets.only(bottom: HiSpace.sm),
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
                Row(children: <Widget>[
                  Expanded(child: Text(str(app.lang == 'fil' ? c['name_fil'] : c['name_en']), style: HiText.title)),
                  if (boolOf(c['hazardous'])) StatusChip(context.t('Special handling'), tone: Tone.warn),
                  if (boolOf(c['food'])) StatusChip(context.t('Sealed only'), tone: Tone.info),
                ]),
                const SizedBox(height: HiSpace.xs),
                Text(context.t(tips[str(c['slug'])] ?? 'Clean, dry and sorted by kind.'), style: HiText.body),
                Text(context.tv('{n} points per kg when reused', <String, Object>{'n': intOf(c['rate_per_kg'])}), style: HiText.caption),
              ]),
            ),
          const SizedBox(height: HiSpace.sm),
          InfoBanner(context.t('Points come only from hub staff after weighing. They cannot be transferred and have no cash value.'),
              icon: Icons.verified_user_outlined),
        ],
      ),
    );
  }
}

class _Tip extends StatelessWidget {
  final IconData icon;
  final String text;
  const _Tip({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: HiSpace.sm),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
        ExcludeSemantics(child: Icon(icon, color: HiColors.accent)),
        const SizedBox(width: HiSpace.ms),
        Expanded(child: Text(text, style: HiText.body)),
      ]),
    );
  }
}

class _Outcome extends StatelessWidget {
  final Color color;
  final String title;
  final String text;
  const _Outcome({required this.color, required this.title, required this.text});

  @override
  Widget build(BuildContext context) {
    return HiCard(
      margin: const EdgeInsets.only(bottom: HiSpace.sm),
      padding: const EdgeInsets.all(14),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
        Container(width: 6, height: 44, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3))),
        const SizedBox(width: HiSpace.ms),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
            Text(title, style: HiText.title),
            Text(text, style: HiText.body),
          ]),
        ),
      ]),
    );
  }
}
