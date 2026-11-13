import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

/// Declare items: choose a hub, list the items (a category and an optional short description each), and get
/// a 6-character code. Staff weigh and sort at the hub; nothing here earns points (R1).
/// Pops with the new declaration.
class DeclareScreen extends StatefulWidget {
  const DeclareScreen({super.key});

  /// The server's limit (MAX_ITEMS_PER_DECLARATION in server/src/dropoffs.js).
  static const int maxItems = 20;

  @override
  State<DeclareScreen> createState() => _DeclareScreenState();
}

class _Line {
  int? categoryId;
  final TextEditingController text = TextEditingController();
}

class _DeclareScreenState extends State<DeclareScreen> {
  int? _hubId;
  final List<_Line> _lines = <_Line>[_Line()];
  final TextEditingController _note = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final AppState app = context.read<AppState>();
    if (app.hubs.length == 1) _hubId = intOf(app.hubs.first['id']);
  }

  @override
  void dispose() {
    for (final _Line l in _lines) {
      l.text.dispose();
    }
    _note.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final AppState app = context.app;
    if (_hubId == null) return setState(() => _error = app.tr('Choose a hub.'));
    if (_lines.any((_Line l) => l.categoryId == null)) return setState(() => _error = app.tr('Choose a category for every item.'));
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final Map<String, dynamic> made = mapOf(await app.api.post('/declarations', <String, dynamic>{
        'hub_id': _hubId,
        'note': _note.text.trim().isEmpty ? null : _note.text.trim(),
        'items': <Map<String, dynamic>>[
          for (final _Line l in _lines) <String, dynamic>{'category_id': l.categoryId, 'description': l.text.text.trim()},
        ],
      }));
      if (mounted) Navigator.of(context).pop(made);
    } catch (e) {
      if (mounted) setState(() => _error = app.errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppState app = context.watch<AppState>();
    String catName(Map<String, dynamic> c) => str(app.lang == 'fil' ? c['name_fil'] : c['name_en']);
    return Scaffold(
      appBar: AppBar(title: Text(context.t('Declare items'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(HiSpace.gutter, HiSpace.md, HiSpace.gutter, HiSpace.xl),
        children: <Widget>[
          Text(context.t('Tell the hub what you will bring. Staff weigh and sort everything when you arrive.'), style: HiText.body),
          const SizedBox(height: HiSpace.md),
          DropdownButtonFormField<int>(
            initialValue: _hubId,
            isExpanded: true,
            decoration: InputDecoration(labelText: context.t('Hub')),
            items: <DropdownMenuItem<int>>[
              for (final Map<String, dynamic> h in app.hubs)
                DropdownMenuItem<int>(value: intOf(h['id']), child: Text(str(h['name']), overflow: TextOverflow.ellipsis)),
            ],
            onChanged: (int? v) => setState(() => _hubId = v),
          ),
          SectionTitle(context.t('Items')),
          for (int n = 0; n < _lines.length; n++)
            HiCard(
              margin: const EdgeInsets.only(bottom: HiSpace.sm),
              padding: const EdgeInsets.all(14),
              child: Column(children: <Widget>[
                Row(children: <Widget>[
                  Expanded(child: Text(context.tv('Item {n}', <String, Object>{'n': n + 1}), style: HiText.label)),
                  if (_lines.length > 1)
                    IconButton(
                      tooltip: context.t('Remove item'),
                      icon: const Icon(Icons.delete_outline_rounded),
                      onPressed: () => setState(() => _lines.removeAt(n).text.dispose()),
                    ),
                ]),
                DropdownButtonFormField<int>(
                  key: ObjectKey(_lines[n]),
                  initialValue: _lines[n].categoryId,
                  isExpanded: true,
                  decoration: InputDecoration(labelText: context.t('Category')),
                  items: <DropdownMenuItem<int>>[
                    for (final Map<String, dynamic> c in app.categories)
                      DropdownMenuItem<int>(value: intOf(c['id']), child: Text(catName(c), overflow: TextOverflow.ellipsis)),
                  ],
                  onChanged: (int? v) => setState(() => _lines[n].categoryId = v),
                ),
                const SizedBox(height: HiSpace.sm),
                HiTextField(
                  controller: _lines[n].text,
                  label: context.t('What is it? (Optional)'),
                  hint: context.t('e.g. 3 shirts, an old phone'),
                  maxLength: 160,
                ),
                if (_categoryOf(app, _lines[n].categoryId)?['food'] == true)
                  InfoBanner(context.t('Food must be sealed and good for at least 3 more days.'), icon: Icons.info_outline),
                if (_categoryOf(app, _lines[n].categoryId)?['hazardous'] == true)
                  InfoBanner(context.t('Hand this to staff. It goes only to an accredited recycler.'), icon: Icons.warning_amber_rounded),
              ]),
            ),
          if (_lines.length < DeclareScreen.maxItems)
            SoftButton(label: context.t('Add another item'), icon: Icons.add_rounded, onPressed: () => setState(() => _lines.add(_Line()))),
          const SizedBox(height: HiSpace.md),
          HiTextField(controller: _note, label: context.t('Note for the hub (Optional)'), maxLength: 255, maxLines: 3),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: HiSpace.sm),
              child: InfoBanner(_error!, tone: Tone.bad),
            ),
          PrimaryButton(label: context.t('Get my drop-off code'), icon: Icons.qr_code_2_rounded, busy: _busy, onPressed: _submit),
        ],
      ),
    );
  }

  Map<String, dynamic>? _categoryOf(AppState app, int? id) {
    if (id == null) return null;
    for (final Map<String, dynamic> c in app.categories) {
      if (intOf(c['id']) == id) return c;
    }
    return null;
  }
}
