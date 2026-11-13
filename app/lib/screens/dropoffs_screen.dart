import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import 'declare_screen.dart';

/// The resident's drop-offs: open codes first (to show at the hub), then the history with each item's outcome,
/// [pageSize] at a time so a long history stays quick.
class DropoffsScreen extends StatefulWidget {
  const DropoffsScreen({super.key});

  static const int pageSize = 20;

  static Future<void> openDeclare(BuildContext context) async {
    final Map<String, dynamic>? made = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute<Map<String, dynamic>>(builder: (BuildContext c) => const DeclareScreen()),
    );
    if (made == null || !context.mounted) return;
    context.app.bump();
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (BuildContext c) => DropoffDetailScreen(declaration: made)));
  }

  @override
  State<DropoffsScreen> createState() => _DropoffsScreenState();
}

class _DropoffsScreenState extends State<DropoffsScreen> {
  List<Map<String, dynamic>> _past = <Map<String, dynamic>>[];
  bool _hasMore = false;
  bool _loadingMore = false;

  String _pastPath(int offset) => '/declarations?status=past&limit=${DropoffsScreen.pageSize}&offset=$offset';

  // Open codes and the first page of the history, together.
  Future<List<Map<String, dynamic>>> _load() async {
    final AppState app = context.app;
    final List<dynamic> both = await Future.wait(<Future<dynamic>>[app.api.get('/declarations?status=open'), app.api.get(_pastPath(0))]);
    _past = listOf(both[1]);
    _hasMore = _past.length == DropoffsScreen.pageSize;
    return listOf(both[0]);
  }

  Future<void> _loadMore() async {
    setState(() => _loadingMore = true);
    try {
      final List<Map<String, dynamic>> more = listOf(await context.app.api.get(_pastPath(_past.length)));
      if (!mounted) return;
      setState(() {
        _past = <Map<String, dynamic>>[..._past, ...more];
        _hasMore = more.length == DropoffsScreen.pageSize;
      });
    } catch (e) {
      if (mounted) showMessage(context, context.app.errorText(e), bad: true);
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppState app = context.watch<AppState>();
    return AsyncView<List<Map<String, dynamic>>>(
      refreshKey: app.version,
      loader: _load,
      builder: (BuildContext context, List<Map<String, dynamic>> open, Future<void> Function() reload) {
        final List<Map<String, dynamic>> past = _past;
        final int maxOpen = app.rule('maxOpenDeclarations', 3);
        return ListView(
          padding: const EdgeInsets.fromLTRB(HiSpace.gutter, 0, HiSpace.gutter, HiSpace.xl),
          children: <Widget>[
            ScreenHeader(context.t('My drop-offs'), subtitle: context.t('Declare items, then show the code at the hub.')),
            PrimaryButton(
              label: context.t('Declare items'),
              icon: Icons.add_rounded,
              onPressed: open.length >= maxOpen ? null : () => DropoffsScreen.openDeclare(context),
            ),
            if (open.length >= maxOpen)
              Padding(
                padding: const EdgeInsets.only(top: HiSpace.sm),
                child: InfoBanner(context.tv('You can have up to {n} open drop-off codes. Bring those items first, or cancel one.', <String, Object>{'n': maxOpen})),
              ),
            if (open.isNotEmpty) SectionTitle(context.t('Open codes')),
            for (final Map<String, dynamic> d in open) _DropoffCard(d: d),
            SectionTitle(context.t('History')),
            if (past.isEmpty)
              EmptyState(message: context.t('No drop-offs yet. Your past drop-offs and what happened to each item show here.'))
            else
              for (final Map<String, dynamic> d in past) _DropoffCard(d: d),
            if (_hasMore)
              Padding(
                padding: const EdgeInsets.only(top: HiSpace.sm),
                child: SoftButton(
                  label: _loadingMore ? context.t('Loading...') : context.t('Show older drop-offs'),
                  icon: Icons.expand_more_rounded,
                  onPressed: _loadingMore ? null : _loadMore,
                ),
              ),
          ],
        );
      },
    );
  }
}

/// How a drop-off status reads, with its tone.
(String, Tone) statusOf(String s) {
  switch (s) {
    case 'open':
      return ('Waiting for drop-off', Tone.info);
    case 'received':
      return ('Received at the hub', Tone.ok);
    case 'expired':
      return ('Expired', Tone.muted);
    case 'cancelled':
      return ('Cancelled', Tone.muted);
  }
  return (s, Tone.muted);
}

/// What happened to one item.
(String, Tone) outcomeOf(Map<String, dynamic> item) {
  switch (str(item['outcome'])) {
    case 'reuse':
      return (str(item['state']) == 'released' ? 'Reused: given to a partner' : 'Reuse', Tone.ok);
    case 'repair':
      return ('Repair', Tone.info);
    case 'recycle':
      return (str(item['state']) == 'recycled' ? 'Recycled' : 'Recycle', Tone.info);
    case 'reject':
      return ('Not accepted', Tone.bad);
  }
  return ('Not sorted yet', Tone.muted);
}

String categoryName(Map<String, dynamic> item, String lang) {
  final Map<String, dynamic> c = mapOf(item['category']);
  return str(lang == 'fil' ? c['name_fil'] : c['name_en']);
}

class _DropoffCard extends StatelessWidget {
  final Map<String, dynamic> d;
  const _DropoffCard({required this.d});

  @override
  Widget build(BuildContext context) {
    final (String label, Tone tone) = statusOf(str(d['status']));
    final List<Map<String, dynamic>> items = listOf(d['items']);
    final bool open = str(d['status']) == 'open';
    return HiCard(
      margin: const EdgeInsets.only(bottom: HiSpace.sm),
      onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (BuildContext c) => DropoffDetailScreen(declaration: d))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
        Row(children: <Widget>[
          Expanded(child: Text(str(mapOf(d['hub'])['name']), style: HiText.title)),
          StatusChip(context.t(label), tone: tone),
        ]),
        const SizedBox(height: HiSpace.xs),
        if (open) Text(str(d['code']), style: HiText.display.copyWith(fontSize: 26, letterSpacing: 4, color: HiColors.accent)),
        Text(
          '${context.tv(items.length == 1 ? '{n} item' : '{n} items', <String, Object>{'n': items.length})} · '
          '${open ? '${context.t('Use by')} ${fmtDate(str(d['expires_at']), context.lang)}' : fmtDate(str(d['received_at'] ?? d['created_at']), context.lang)}',
          style: HiText.caption,
        ),
      ]),
    );
  }
}

/// One drop-off: the code (while open), the items and what happened to each, and the points.
class DropoffDetailScreen extends StatefulWidget {
  final Map<String, dynamic> declaration;
  const DropoffDetailScreen({super.key, required this.declaration});

  @override
  State<DropoffDetailScreen> createState() => _DropoffDetailScreenState();
}

class _DropoffDetailScreenState extends State<DropoffDetailScreen> {
  late Map<String, dynamic> d = widget.declaration;
  bool _busy = false;

  Future<void> _reload() async {
    final Map<String, dynamic> fresh = mapOf(await context.app.api.get('/declarations/${d['id']}'));
    if (mounted) setState(() => d = fresh);
  }

  Future<void> _cancel() async {
    final bool ok = await confirmDialog(context,
        title: context.tx('Cancel this drop-off?'),
        message: context.tx('The code stops working. You can declare the items again later.'),
        confirmLabel: context.tx('Cancel drop-off'),
        danger: true);
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      final Map<String, dynamic> fresh = mapOf(await context.app.api.delete('/declarations/${d['id']}'));
      if (!mounted) return;
      setState(() => d = fresh);
      context.app.bump();
      showMessage(context, context.tx('Drop-off cancelled.'));
    } catch (e) {
      if (mounted) showMessage(context, context.app.errorText(e), bad: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final String status = str(d['status']);
    final (String label, Tone tone) = statusOf(status);
    final List<Map<String, dynamic>> items = listOf(d['items']);
    final int points = items.fold(0, (int s, Map<String, dynamic> i) => s + (str(i['points_status']) == 'cancelled' ? 0 : intOf(i['points'])));
    final bool anyPending = items.any((Map<String, dynamic> i) => str(i['points_status']) == 'pending');
    return Scaffold(
      appBar: AppBar(title: Text(context.t('Drop-off'))),
      body: RefreshIndicator(
        onRefresh: _reload,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(HiSpace.gutter, HiSpace.md, HiSpace.gutter, HiSpace.xl),
          children: <Widget>[
            Row(children: <Widget>[
              Expanded(child: Text(str(mapOf(d['hub'])['name']), style: HiText.h2)),
              StatusChip(context.t(label), tone: tone),
            ]),
            const SizedBox(height: HiSpace.md),
            if (status == 'open') ...<Widget>[
              HiCard(
                color: HiColors.primarySoft,
                borderColor: HiColors.primary,
                child: Column(children: <Widget>[
                  Text(context.t('Your drop-off code'), style: HiText.label),
                  const SizedBox(height: HiSpace.xs),
                  Semantics(
                    label: str(d['code']).split('').join(' '),
                    child: ExcludeSemantics(
                      child: SelectableText(str(d['code']),
                          style: HiText.display.copyWith(fontSize: 40, letterSpacing: 8, color: HiColors.accent)),
                    ),
                  ),
                  const SizedBox(height: HiSpace.xs),
                  Text('${context.t('Show this code to the hub staff. Use it by')} ${fmtDate(str(d['expires_at']), context.lang)}.',
                      textAlign: TextAlign.center, style: HiText.body),
                  TextButton.icon(
                    onPressed: () {
                      Clipboard.setData(ClipboardData(text: str(d['code'])));
                      showMessage(context, context.tx('Code copied.'));
                    },
                    icon: const Icon(Icons.copy_rounded, size: 18),
                    label: Text(context.t('Copy code')),
                  ),
                ]),
              ),
              const SizedBox(height: HiSpace.sm),
              InfoBanner(context.t('Points come only from hub staff after weighing. They cannot be transferred and have no cash value.'),
                  icon: Icons.verified_user_outlined),
            ],
            if (status == 'received') ...<Widget>[
              HiCard(
                child: Row(children: <Widget>[
                  Expanded(child: Text(context.t('Points from this drop-off'), style: HiText.body)),
                  Text('$points', style: HiText.h2),
                ]),
              ),
              if (anyPending) InfoBanner(context.t('Points stay pending until every item is sorted and handled.'), icon: Icons.hourglass_top_rounded),
            ],
            SectionTitle(context.t('Items')),
            for (final Map<String, dynamic> i in items) _ItemRow(item: i),
            if (str(d['note']).isNotEmpty) KeyValueRow(context.t('Note'), str(d['note'])),
            if (status == 'open') ...<Widget>[
              const SizedBox(height: HiSpace.md),
              SoftButton(label: context.t('Cancel drop-off'), icon: Icons.close_rounded, onPressed: _busy ? null : _cancel),
            ],
          ],
        ),
      ),
    );
  }
}

class _ItemRow extends StatelessWidget {
  final Map<String, dynamic> item;
  const _ItemRow({required this.item});

  @override
  Widget build(BuildContext context) {
    final (String label, Tone tone) = outcomeOf(item);
    final double? kg = item['weight_kg'] == null ? null : (item['weight_kg'] as num).toDouble();
    final String pStatus = str(item['points_status']);
    return HiCard(
      margin: const EdgeInsets.only(bottom: HiSpace.sm),
      padding: const EdgeInsets.all(14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
        Row(children: <Widget>[
          Expanded(child: Text(categoryName(item, context.lang), style: HiText.title)),
          StatusChip(context.t(label), tone: tone),
        ]),
        if (str(item['description']).isNotEmpty) Text(str(item['description']), style: HiText.body),
        if (kg != null)
          Text(
            '${kg.toStringAsFixed(kg == kg.roundToDouble() ? 0 : 2)} kg · ${intOf(item['points'])} ${context.t('points')}'
            '${pStatus.isEmpty ? '' : ' (${context.t(pStatus == 'confirmed' ? 'confirmed' : pStatus == 'pending' ? 'pending' : 'cancelled')})'}',
            style: HiText.caption,
          ),
      ]),
    );
  }
}
