import 'package:flutter/material.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import '../widgets/photo.dart';

/// M8: share an item, or edit one ([item] given). The risk tier decides who approves the loan.
class AddItemScreen extends StatefulWidget {
  final Map<String, dynamic>? item;

  /// Opens on "Give it away" (Simple mode's Give button). The person can still switch to "Lend it".
  final bool startGiving;
  const AddItemScreen({super.key, this.item, this.startGiving = false});

  @override
  State<AddItemScreen> createState() => _AddItemScreenState();
}

class _AddItemScreenState extends State<AddItemScreen> {
  final TextEditingController _title = TextEditingController();
  final TextEditingController _desc = TextEditingController();
  int? _categoryId;
  int? _pickupId;
  String _condition = 'good';
  String _tier = 'low';
  bool _repair = false;
  bool _give = false; // "Give it away" (a donation) instead of lending
  String _claimMode = 'first';
  String? _photo;
  bool _busy = false;
  String? _error;

  bool get _editing => widget.item != null;

  @override
  void initState() {
    super.initState();
    _give = widget.item == null && widget.startGiving;
    final Map<String, dynamic>? it = widget.item;
    if (it != null) {
      _title.text = str(it['title']);
      _desc.text = str(it['description']);
      _categoryId = intOf(it['category_id'], 0) == 0 ? null : intOf(it['category_id']);
      _pickupId = mapOf(it['pickup_point'])['id'] == null ? null : intOf(mapOf(it['pickup_point'])['id']);
      _condition = str(it['condition'], 'good');
      _tier = str(it['tier'], 'low');
      _repair = boolOf(it['repair_reuse']);
      _photo = it['photo_url'] == null ? null : str(it['photo_url']);
    }
  }

  @override
  void dispose() {
    _title.dispose();
    _desc.dispose();
    super.dispose();
  }

  Future<void> _photoPick() async {
    final String? url = await pickAndUploadPhoto(context);
    if (url != null && mounted) setState(() => _photo = url);
  }

  Future<void> _save() async {
    if (_title.text.trim().length < 2) {
      setState(() => _error = context.tx('Please enter the item name.'));
      return;
    }
    if (_categoryId == null) {
      setState(() => _error = context.tx('Choose a category.'));
      return;
    }
    if (_pickupId == null) {
      setState(() => _error = context.tx('Choose a pickup point.'));
      return;
    }
    final AppState app = context.app;
    // Once, before the first listing: neighbors share at their own risk; the barangay helps but does not pay.
    bool acceptTerms = false;
    if (!_editing && app.user?['lender_terms_accepted'] != true) {
      acceptTerms = await confirmDialog(context,
          title: context.tx('Before you share'),
          message: context.tx('Neighbors share at their own risk. If something is damaged or lost, the barangay helps you settle it and records what happened, but it does not pay for items. Borrowers must return items in the condition they got them.'),
          confirmLabel: context.tx('I understand'));
      if (!acceptTerms || !mounted) return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final Map<String, dynamic> body = <String, dynamic>{
        if (acceptTerms) 'accept_terms': true,
        'title': _title.text.trim(),
        'description': _desc.text.trim(),
        'category_id': _categoryId,
        'pickup_point_id': _pickupId,
        'condition': _condition,
        'tier': _tier,
        'repair_reuse': _repair,
        'photo_url': _photo,
        if (_give) 'listing_type': 'donate',
        if (_give) 'claim_mode': _claimMode,
      };
      final dynamic saved = _editing ? await app.api.patch('/items/${widget.item!['id']}', body) : await app.api.post('/items', body);
      final bool held = mapOf(saved)['review_status'] == 'flagged';
      await app.bump();
      if (!mounted) return;
      Navigator.pop(context);
      if (held) {
        // The automatic checks held it back: say so kindly, without saying which check.
        pawsaDialog(context, pose: 'point', title: context.tx('The barangay will check it first'),
            message: context.tx('Neighbors will see your item once barangay staff have looked at it. This keeps everyone safe.'));
      } else if (_editing) {
        showMessage(context, context.tx('Changes saved.'));
      } else {
        pawsaDialog(context, pose: 'cheer', title: context.tx('Thank you, neighbor!'),
            message: _give
                ? context.tx('Your gift is listed as free to take. You will be told when someone claims it.')
                : context.tx('Your item is now shared. You earn a credit after each good, on-time return.'));
      }
    } catch (e) {
      if (mounted) setState(() => _error = context.app.errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// A big selectable card (at least 72 dp tall) with an icon, a name and one line of explanation.
  Widget _choice(BuildContext context, bool on, IconData icon, String title, String line, VoidCallback onTap, {bool wide = false}) {
    return Semantics(
      selected: on,
      button: true,
      child: HiCard(
        color: on ? HiColors.primarySoft : Colors.white,
        borderColor: on ? HiColors.accent : HiColors.line,
        onTap: onTap,
        child: Row(children: <Widget>[
          Icon(icon, color: on ? HiColors.accent : HiColors.muted),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
              Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
              Text(line, style: const TextStyle(color: HiColors.muted, fontSize: 13)),
            ]),
          ),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final List<Map<String, dynamic>> cats = context.app.categories;
    final List<Map<String, dynamic>> points = context.app.pickupPoints;
    final String photoUrl = context.app.api.absolute(_photo);
    return Scaffold(
      appBar: hiAppBar(_editing ? context.t('Edit item') : context.t('Share an item')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: <Widget>[
          if (!_editing) ...<Widget>[
            Row(children: <Widget>[
              Expanded(child: _choice(context, !_give, Icons.handshake_outlined, context.t('Lend it'), context.t('It comes back to you.'), () => setState(() => _give = false))),
              const SizedBox(width: 8),
              Expanded(child: _choice(context, _give, Icons.volunteer_activism, context.t('Give it away'), context.t('Free, for good.'), () => setState(() {
                    _give = true;
                    if (_tier == 'high') _tier = 'low';
                  }))),
            ]),
            const SizedBox(height: 14),
          ],
          Semantics(
            button: true,
            label: photoUrl.isEmpty ? context.t('Add a photo') : context.t('Change photo'),
            child: Material(
              color: HiColors.primarySoft,
              borderRadius: BorderRadius.circular(kRadius),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: _photoPick,
                child: SizedBox(
                  height: 160,
                  child: photoUrl.isEmpty
                      ? Column(mainAxisAlignment: MainAxisAlignment.center, children: <Widget>[
                          const Icon(Icons.add_a_photo, size: 36, color: HiColors.accent),
                          const SizedBox(height: 6),
                          Text(context.t('Add a photo'), style: const TextStyle(color: HiColors.accent, fontWeight: FontWeight.w800)),
                        ])
                      : Image.network(photoUrl, fit: BoxFit.cover, width: double.infinity, excludeFromSemantics: true),
                ),
              ),
            ),
          ),
          const SizedBox(height: 14),
          TextField(controller: _title, textCapitalization: TextCapitalization.sentences, decoration: InputDecoration(labelText: context.t('Item name'))),
          const SizedBox(height: 12),
          TextField(controller: _desc, maxLines: 3, decoration: InputDecoration(labelText: context.t('Description (optional)'))),
          const SizedBox(height: 12),
          DropdownButtonFormField<int>(
            initialValue: _categoryId,
            decoration: InputDecoration(labelText: context.t('Category')),
            items: cats.map((Map<String, dynamic> c) => DropdownMenuItem<int>(value: intOf(c['id']), child: Text(context.lang == 'fil' ? str(c['name_fil']) : str(c['name_en'])))).toList(),
            onChanged: (int? v) => setState(() => _categoryId = v),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<int>(
            initialValue: _pickupId,
            isExpanded: true,
            decoration: InputDecoration(labelText: context.t('Pickup point')),
            items: points.map((Map<String, dynamic> p) => DropdownMenuItem<int>(value: intOf(p['id']), child: Text(str(p['name']), overflow: TextOverflow.ellipsis))).toList(),
            onChanged: (int? v) => setState(() => _pickupId = v),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _condition,
            decoration: InputDecoration(labelText: context.t('Condition')),
            items: <DropdownMenuItem<String>>[
              DropdownMenuItem<String>(value: 'new', child: Text(context.t('Like new'))),
              DropdownMenuItem<String>(value: 'good', child: Text(context.t('Good'))),
              DropdownMenuItem<String>(value: 'fair', child: Text(context.t('Fair'))),
              DropdownMenuItem<String>(value: 'worn', child: Text(context.t('Well used'))),
            ],
            onChanged: (String? v) => setState(() => _condition = v ?? _condition),
          ),
          if (_give) ...<Widget>[
            SectionTitle(context.t('Who gets it?')),
            _choice(context, _claimMode == 'first', Icons.bolt, context.t('First to claim'),
                context.t('The first neighbor to claim it has 48 hours to pick it up.'), () => setState(() => _claimMode = 'first'), wide: true),
            const SizedBox(height: 8),
            _choice(context, _claimMode == 'barangay', Icons.account_balance, context.t('Let the barangay choose'),
                context.t('Neighbors ask for it for 3 days, then the barangay chooses, families in need first.'), () => setState(() => _claimMode = 'barangay'), wide: true),
            const SizedBox(height: 8),
            Text(context.t('Valuable items are given to the barangay at the hall. Food, baby products and safety gear cannot be given away.'),
                style: const TextStyle(color: HiColors.muted, fontSize: 12)),
          ],
          if (!_give) SectionTitle(context.t('How should borrowing work?')),
          if (!_give) ...<String>['low', 'medium', 'high'].map((String t) {
            final bool on = _tier == t;
            final String desc = t == 'low'
                ? context.t('Anyone verified can borrow right away. Best for cheap, simple things.')
                : (t == 'medium'
                    ? context.t('You approve each request and take a photo at handover and return.')
                    : context.t('Barangay staff approve and handle handover at the hall. For valuable items.'));
            return HiCard(
              margin: const EdgeInsets.only(bottom: 8),
              color: on ? HiColors.primarySoft : Colors.white,
              borderColor: on ? HiColors.accent : HiColors.line,
              onTap: () => setState(() => _tier = t),
              child: Row(children: <Widget>[
                Icon(on ? Icons.radio_button_checked : Icons.radio_button_off, color: on ? HiColors.accent : HiColors.muted),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
                    Text(tierLabel(context, t), style: const TextStyle(fontWeight: FontWeight.w800)),
                    Text(desc, style: const TextStyle(color: HiColors.muted, fontSize: 13)),
                  ]),
                ),
              ]),
            );
          }),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            activeTrackColor: HiColors.leaf,
            title: Text(context.t('Repair and Reuse'), style: const TextStyle(fontWeight: FontWeight.w800)),
            subtitle: Text(context.t('This item was fixed or repurposed instead of thrown away.')),
            value: _repair,
            onChanged: (bool v) => setState(() => _repair = v),
          ),
          Text(context.t('Not allowed: weapons, medicines, chemicals and other hazardous items.'), style: const TextStyle(color: HiColors.muted, fontSize: 12)),
          if (_error != null) ...<Widget>[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: HiColors.dangerSoft, borderRadius: BorderRadius.circular(12)),
              child: Text(_error!, style: const TextStyle(color: HiColors.danger, fontWeight: FontWeight.w600)),
            ),
          ],
          const SizedBox(height: 16),
          PrimaryButton(label: _editing ? context.t('Save changes') : (_give ? context.t('Give it away') : context.t('Share item')), busy: _busy, onPressed: _save),
          const SizedBox(height: 20),
        ],
      ),
    );
  }
}
