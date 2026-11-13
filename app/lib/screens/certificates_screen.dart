import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

const Map<String, IconData> _levelIcons = <String, IconData>{
  'participation': Icons.workspace_premium_outlined,
  'recognition': Icons.military_tech_outlined,
  'champion': Icons.emoji_events_outlined,
};

/// My certificates (GET /me/certificates): recognition signed by my hub's head and the CircuLink programme
/// lead. Each level shows what it needs, how far I am, and lets me claim it once I qualify.
class CertificatesScreen extends StatelessWidget {
  const CertificatesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final AppState app = context.watch<AppState>();
    return Scaffold(
      appBar: hiAppBar(context.t('My certificates')),
      body: AsyncView<Map<String, dynamic>>(
        refreshKey: app.version,
        loader: () async => mapOf(await app.api.get('/me/certificates')),
        builder: (BuildContext context, Map<String, dynamic> data, Future<void> Function() reload) {
          final Map<String, dynamic> stats = mapOf(data['stats']);
          return RefreshIndicator(
            onRefresh: reload,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(HiSpace.gutter, HiSpace.md, HiSpace.gutter, HiSpace.xl),
              children: <Widget>[
                Text(context.t('Certificates recognise people who keep things in use, again and again.'), style: HiText.title),
                const SizedBox(height: HiSpace.xs),
                Text(
                  context.t('Each one is signed by the head of your hub (the school principal or the punong barangay) and the CircuLink programme lead. They are recognition only: no cash value and not academic credit.'),
                  style: HiText.body.copyWith(color: HiColors.muted),
                ),
                const SizedBox(height: HiSpace.md),
                Wrap(spacing: HiSpace.sm, runSpacing: HiSpace.sm, children: <Widget>[
                  StatusChip(context.tv('{n} points', <String, Object>{'n': intOf(stats['points'])}), tone: Tone.ok),
                  StatusChip(context.tv('{n} drop-offs', <String, Object>{'n': intOf(stats['dropoffs'])}), tone: Tone.info),
                  StatusChip(context.tv('{n} months active', <String, Object>{'n': intOf(stats['months'])}), tone: Tone.muted),
                ]),
                const SizedBox(height: HiSpace.lg),
                for (final Map<String, dynamic> l in listOf(data['levels'])) _LevelCard(level: l, onChanged: reload),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _LevelCard extends StatefulWidget {
  final Map<String, dynamic> level;
  final Future<void> Function() onChanged;
  const _LevelCard({required this.level, required this.onChanged});

  @override
  State<_LevelCard> createState() => _LevelCardState();
}

class _LevelCardState extends State<_LevelCard> {
  bool _busy = false;

  Future<void> _claim() async {
    final Map<String, dynamic> l = widget.level;
    final bool review = boolOf(l['review']);
    final bool ok = await confirmDialog(
      context,
      title: context.tx('Claim this certificate?'),
      message: context.tx(review
          ? 'An admin checks your history first. Your name will be on the certificate, and anyone with its code can check it.'
          : 'Your name will be on the certificate, and anyone with its code can check it.'),
      confirmLabel: context.tx('Claim'),
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      final Map<String, dynamic> c = mapOf(await context.app.api.post('/me/certificates', <String, dynamic>{'level': str(l['key'])}));
      if (!mounted) return;
      if (str(c['status']) == 'issued') {
        await celebrateDialog(context, title: context.tx('Congratulations!'), message: context.tx('Your certificate is ready. Thank you for keeping things in use.'));
      } else {
        showMessage(context, context.tx('Request sent. An admin will check it soon.'));
      }
      await widget.onChanged();
    } on ApiException catch (e) {
      if (mounted) showMessage(context, context.app.errorText(e), bad: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _view(String code) async {
    final Uri uri = Uri.parse(context.app.api.absolute('/certificates/$code'));
    final bool ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && mounted) showMessage(context, context.tx('Could not open the certificate.'), bad: true);
  }

  @override
  Widget build(BuildContext context) {
    final Map<String, dynamic> l = widget.level;
    final Map<String, dynamic>? cert = l['certificate'] == null ? null : mapOf(l['certificate']);
    final String status = str(cert?['status']);
    final Map<String, dynamic> missing = mapOf(l['missing']);
    final bool eligible = boolOf(l['eligible']);
    final bool issued = status == 'issued';

    // How far along: the least-finished of the three requirements.
    double part(String need, String miss) {
      final int n = intOf(l[need]);
      return n == 0 ? 1 : ((n - intOf(missing[miss])) / n).clamp(0, 1).toDouble();
    }

    final double progress = <double>[part('points', 'points'), part('dropoffs', 'dropoffs'), part('months', 'months')].reduce((double a, double b) => a < b ? a : b);

    Widget need(String label, int remaining) => Padding(
          padding: const EdgeInsets.only(top: HiSpace.xs),
          child: Row(children: <Widget>[
            ExcludeSemantics(
              child: Icon(remaining == 0 ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded, size: 18, color: remaining == 0 ? HiColors.leaf : HiColors.muted),
            ),
            const SizedBox(width: HiSpace.sm),
            Expanded(
              child: Text(
                remaining == 0 ? label : '$label · ${context.tv('{n} more', <String, Object>{'n': remaining})}',
                style: HiText.body,
              ),
            ),
          ]),
        );

    return HiCard(
      color: issued ? HiColors.sunSoft : null,
      borderColor: issued ? HiColors.sun : null,
      padding: const EdgeInsets.all(HiSpace.md),
      margin: const EdgeInsets.only(bottom: HiSpace.md),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
        Row(children: <Widget>[
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(color: issued ? HiColors.sun : HiColors.primarySoft, shape: BoxShape.circle),
            child: ExcludeSemantics(child: Icon(_levelIcons[str(l['key'])] ?? Icons.workspace_premium_outlined, color: issued ? HiColors.ink : HiColors.accent)),
          ),
          const SizedBox(width: HiSpace.ms),
          Expanded(child: Text(context.t(str(l['name'])), style: HiText.title)),
          if (status.isNotEmpty) _StatusTag(status: status),
        ]),
        const SizedBox(height: HiSpace.sm),
        need(context.tv('{n} confirmed points', <String, Object>{'n': intOf(l['points'])}), intOf(missing['points'])),
        need(context.tv('{n} drop-offs', <String, Object>{'n': intOf(l['dropoffs'])}), intOf(missing['dropoffs'])),
        need(context.tv('{n} months active', <String, Object>{'n': intOf(l['months'])}), intOf(missing['months'])),
        if (boolOf(l['review'])) need(context.t('An admin checks your history'), 0),
        if (str(cert?['reason']).isNotEmpty) ...<Widget>[
          const SizedBox(height: HiSpace.sm),
          InfoBanner(str(cert?['reason']), tone: Tone.bad),
        ],
        const SizedBox(height: HiSpace.md),
        if (issued) ...<Widget>[
          Text('${context.t('Certificate code')}: ${str(cert?['code'])}', style: HiText.label),
          const SizedBox(height: HiSpace.sm),
          PrimaryButton(label: context.t('View certificate'), icon: Icons.open_in_new_rounded, onPressed: () => _view(str(cert?['code']))),
          const SizedBox(height: HiSpace.sm),
          SoftButton(
            label: context.t('Copy code'),
            icon: Icons.copy_rounded,
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: str(cert?['code'])));
              if (context.mounted) showMessage(context, context.tx('Code copied.'));
            },
          ),
        ] else if (status == 'pending')
          InfoBanner(context.t('Waiting for an admin to check your history.'), tone: Tone.warn)
        else if (status == 'revoked')
          const SizedBox.shrink()
        else if (eligible)
          PrimaryButton(label: context.t('Claim certificate'), icon: Icons.workspace_premium_rounded, busy: _busy, onPressed: _busy ? null : _claim)
        else
          Semantics(
            label: context.t('Progress to this certificate'),
            value: '${(progress * 100).round()}%',
            child: ClipRRect(
              borderRadius: BorderRadius.circular(HiRadius.pill),
              child: LinearProgressIndicator(value: progress, minHeight: 8, backgroundColor: HiColors.surfaceMuted, color: HiColors.primary),
            ),
          ),
      ]),
    );
  }
}

class _StatusTag extends StatelessWidget {
  final String status;
  const _StatusTag({required this.status});

  @override
  Widget build(BuildContext context) {
    switch (status) {
      case 'issued':
        return StatusChip(context.t('Issued'), tone: Tone.ok);
      case 'pending':
        return StatusChip(context.t('Waiting'), tone: Tone.warn);
      case 'declined':
        return StatusChip(context.t('Not approved'), tone: Tone.bad);
      default:
        return StatusChip(context.t('Revoked'), tone: Tone.bad);
    }
  }
}
