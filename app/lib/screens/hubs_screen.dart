import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import 'hub_detail_screen.dart';

/// Where to bring things: the active drop-off hubs (tap one for its details) and what hubs accept,
/// shown as icons instead of a long list.
class HubsScreen extends StatelessWidget {
  const HubsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final AppState app = context.watch<AppState>();
    String name(Map<String, dynamic> c) => str(app.lang == 'fil' ? c['name_fil'] : c['name_en']);
    return RefreshIndicator(
      onRefresh: () => app.loadMeta().then((_) => app.bump()),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(HiSpace.gutter, 0, HiSpace.gutter, HiSpace.xl),
        children: <Widget>[
          ScreenHeader(context.t('Drop-off hubs'), subtitle: context.t('Schools and barangays that accept items. Tap one for details.')),
          if (app.hubs.isEmpty)
            EmptyState(message: context.t('No hubs are open right now. Pull down to check again.'))
          else
            for (final Map<String, dynamic> h in app.hubs)
              HiCard(
                onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (BuildContext c) => HubDetailScreen(hub: h))),
                child: Row(children: <Widget>[
                  HubThumb(hub: h, size: 64),
                  const SizedBox(width: HiSpace.ms),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
                      Text(str(h['name']), style: HiText.title),
                      const SizedBox(height: 2),
                      Text(hubTypeLabel(context, h), style: HiText.label.copyWith(color: HiColors.accent)),
                      Text(str(h['address']), maxLines: 1, overflow: TextOverflow.ellipsis, style: HiText.caption),
                      if (str(h['hours']).isNotEmpty)
                        Row(children: <Widget>[
                          const ExcludeSemantics(child: Icon(Icons.schedule_rounded, size: 14, color: HiColors.muted)),
                          const SizedBox(width: 4),
                          Expanded(child: Text(str(h['hours']), maxLines: 1, overflow: TextOverflow.ellipsis, style: HiText.caption)),
                        ]),
                    ]),
                  ),
                  const ExcludeSemantics(child: Icon(Icons.chevron_right_rounded, color: HiColors.muted)),
                ]),
              ),
          SectionTitle(context.t('What hubs accept')),
          Text(context.t('Every hub accepts these. Hazardous items and food need special care.'), style: HiText.caption),
          const SizedBox(height: HiSpace.md),
          Wrap(
            spacing: HiSpace.sm,
            runSpacing: HiSpace.md,
            children: <Widget>[
              for (final Map<String, dynamic> c in app.categories) CategoryIcon(category: c, name: name(c), showLabel: true, size: 44),
            ],
          ),
        ],
      ),
    );
  }
}

/// "School", "Barangay" or "Other", in the person's language.
String hubTypeLabel(BuildContext context, Map<String, dynamic> h) {
  final String type = str(h['type']);
  return context.t(type == 'school' ? 'School' : type == 'barangay' ? 'Barangay' : 'Other');
}

/// The hub's photo, or its type icon on a soft tile while there is no photo yet.
class HubThumb extends StatelessWidget {
  final Map<String, dynamic> hub;
  final double size;
  final double? width;
  final double radius;
  const HubThumb({super.key, required this.hub, required this.size, this.width, this.radius = HiRadius.md});

  @override
  Widget build(BuildContext context) {
    final String url = context.read<AppState>().api.absolute(str(hub['photo_url']));
    final bool school = str(hub['type']) == 'school';
    final Widget placeholder = Container(
      width: width ?? size,
      height: size,
      color: school ? HiColors.primarySoft : HiColors.sunSoft,
      child: Icon(school ? Icons.school_rounded : Icons.account_balance_rounded, size: size * 0.42, color: school ? HiColors.accent : HiColors.warn),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: url.isEmpty
          ? ExcludeSemantics(child: placeholder)
          : Image.network(
              url,
              width: width ?? size,
              height: size,
              fit: BoxFit.cover,
              semanticLabel: context.tv('Photo of {name}', <String, Object>{'name': str(hub['name'])}),
              errorBuilder: (BuildContext c, Object e, StackTrace? s) => ExcludeSemantics(child: placeholder),
            ),
    );
  }
}
