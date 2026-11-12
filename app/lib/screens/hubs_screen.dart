import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

/// Where to bring things: the active drop-off hubs, and what each kind of item is worth.
class HubsScreen extends StatelessWidget {
  const HubsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final AppState app = context.watch<AppState>();
    return RefreshIndicator(
      onRefresh: () => app.loadMeta().then((_) => app.bump()),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(HiSpace.gutter, 0, HiSpace.gutter, HiSpace.xl),
        children: <Widget>[
          ScreenHeader(context.t('Drop-off hubs'), subtitle: context.t('Schools and barangays that accept items.')),
          if (app.hubs.isEmpty)
            EmptyState(message: context.t('No hubs are open right now. Pull down to check again.'))
          else
            for (final Map<String, dynamic> h in app.hubs)
              HiCard(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
                  Row(children: <Widget>[
                    Icon(str(h['type']) == 'school' ? Icons.school_outlined : Icons.account_balance_outlined, color: HiColors.accent),
                    const SizedBox(width: HiSpace.sm),
                    Expanded(child: Text(str(h['name']), style: HiText.title)),
                  ]),
                  const SizedBox(height: HiSpace.xs),
                  KeyValueRow(context.t('Type'), context.t(str(h['type']) == 'school' ? 'School' : str(h['type']) == 'barangay' ? 'Barangay' : 'Other')),
                  KeyValueRow(context.t('Address'), str(h['address'])),
                  if (str(h['hours']).isNotEmpty) KeyValueRow(context.t('Open'), str(h['hours'])),
                ]),
              ),
          SectionTitle(context.t('What hubs accept')),
          for (final Map<String, dynamic> c in app.categories)
            HiCard(
              margin: const EdgeInsets.only(bottom: HiSpace.sm),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              child: Row(children: <Widget>[
                Expanded(child: Text(str(app.lang == 'fil' ? c['name_fil'] : c['name_en']), style: HiText.body)),
                if (boolOf(c['hazardous'])) StatusChip(context.t('Special handling'), tone: Tone.warn),
                if (boolOf(c['food'])) StatusChip(context.t('Sealed only'), tone: Tone.info),
              ]),
            ),
        ],
      ),
    );
  }
}
