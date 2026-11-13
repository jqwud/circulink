import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import 'hubs_screen.dart';

/// One hub: its photo (a real place builds trust), address and hours, directions, and what it accepts.
class HubDetailScreen extends StatelessWidget {
  final Map<String, dynamic> hub;
  const HubDetailScreen({super.key, required this.hub});

  Future<void> _openMaps(BuildContext context) async {
    // A Google Maps search for the address: free, no API key, opens the Maps app when it is installed.
    final Uri uri = Uri.https('www.google.com', '/maps/search/', <String, String>{'api': '1', 'query': '${str(hub['name'])}, ${str(hub['address'])}'});
    final bool ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) showMessage(context, context.tx('Could not open Maps.'), bad: true);
  }

  @override
  Widget build(BuildContext context) {
    final AppState app = context.watch<AppState>();
    String name(Map<String, dynamic> c) => str(app.lang == 'fil' ? c['name_fil'] : c['name_en']);
    final bool hasPhoto = str(hub['photo_url']).isNotEmpty;
    return Scaffold(
      appBar: hiAppBar(str(hub['name'])),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(HiSpace.gutter, HiSpace.sm, HiSpace.gutter, HiSpace.xl),
          children: <Widget>[
            HubThumb(hub: hub, size: 200, width: double.infinity, radius: HiRadius.lg),
            if (!hasPhoto) ...<Widget>[
              const SizedBox(height: HiSpace.sm),
              Text(context.t('A photo of this place will be added by the hub admin.'), style: HiText.caption),
            ],
            const SizedBox(height: HiSpace.md),
            Text(str(hub['name']), style: HiText.h1),
            const SizedBox(height: HiSpace.xs),
            Row(children: <Widget>[
              StatusChip(hubTypeLabel(context, hub), tone: Tone.ok),
              const SizedBox(width: HiSpace.sm),
              StatusChip(context.t('Verified hub'), tone: Tone.info),
            ]),
            const SizedBox(height: HiSpace.md),
            HiCard(
              margin: EdgeInsets.zero,
              child: Column(children: <Widget>[
                KeyValueRow(context.t('Address'), str(hub['address'])),
                if (str(hub['hours']).isNotEmpty) KeyValueRow(context.t('Open'), str(hub['hours'])),
              ]),
            ),
            const SizedBox(height: HiSpace.md),
            PrimaryButton(label: context.t('Open in Maps'), icon: Icons.map_outlined, onPressed: () => _openMaps(context)),
            const SizedBox(height: HiSpace.lg),
            SectionTitle(context.t('What this hub accepts')),
            Wrap(
              spacing: HiSpace.sm,
              runSpacing: HiSpace.md,
              children: <Widget>[
                for (final Map<String, dynamic> c in app.categories) CategoryIcon(category: c, name: name(c), showLabel: true, size: 44),
              ],
            ),
            const SizedBox(height: HiSpace.lg),
            InfoBanner(
              context.t('Only hubs approved by CircuLink admins appear here. Staff weigh every item, so your points are always checked.'),
              icon: Icons.verified_user_outlined,
            ),
          ],
        ),
      ),
    );
  }
}
