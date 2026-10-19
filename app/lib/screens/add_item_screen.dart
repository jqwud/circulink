import 'package:flutter/material.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import '../widgets/photo.dart';

/// M8: share an item. The risk tier decides who approves the loan.
class AddItemScreen extends StatefulWidget {
  const AddItemScreen({super.key});

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
  String? _photo;
  bool _busy = false;
  String? _error;

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
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.app.api.post('/items', <String, dynamic>{
        'title': _title.text.trim(),
        'description': _desc.text.trim(),
        'category_id': _categoryId,
        'pickup_point_id': _pickupId,
        'condition': _condition,
        'tier': _tier,
        'repair_reuse': _repair,
        'photo_url': _photo,
      });
      await context.app.bump();
      if (!mounted) return;
      Navigator.pop(context);
      pawsaDialog(context, pose: 'cheer', title: context.tx('Thank you, neighbor!'), message: context.tx('Your item is now shared. You earn a credit after each good, on-time return.'));
    } catch (e) {
      if (mounted) setState(() => _error = context.app.errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final List<Map<String, dynamic>> cats = context.app.categories;
    final List<Map<String, dynamic>> points = context.app.pickupPoints;
    final String photoUrl = context.app.api.absolute(_photo);
    return Scaffold(
      appBar: hiAppBar(context.t('Share an item')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: <Widget>[
          GestureDetector(
            onTap: _photoPick,
            child: Container(
              height: 160,
              decoration: BoxDecoration(color: HiColors.primarySoft, borderRadius: BorderRadius.circular(kRadius)),
              clipBehavior: Clip.antiAlias,
              child: photoUrl.isEmpty
                  ? Column(mainAxisAlignment: MainAxisAlignment.center, children: <Widget>[
                      const Icon(Icons.add_a_photo, size: 36, color: HiColors.primary),
                      const SizedBox(height: 6),
                      Text(context.t('Add a photo'), style: const TextStyle(color: HiColors.primary, fontWeight: FontWeight.w800)),
                    ])
                  : Image.network(photoUrl, fit: BoxFit.cover, width: double.infinity),
            ),
          ),
          const SizedBox(height: 14),
          TextField(controller: _title, textCapitalization: TextCapitalization.sentences, decoration: InputDecoration(labelText: context.t('Item name'), border: const OutlineInputBorder())),
          const SizedBox(height: 12),
          TextField(controller: _desc, maxLines: 3, decoration: InputDecoration(labelText: context.t('Description (optional)'), border: const OutlineInputBorder())),
          const SizedBox(height: 12),
          DropdownButtonFormField<int>(
            value: _categoryId,
            decoration: InputDecoration(labelText: context.t('Category'), border: const OutlineInputBorder()),
            items: cats.map((Map<String, dynamic> c) => DropdownMenuItem<int>(value: intOf(c['id']), child: Text(context.lang == 'fil' ? str(c['name_fil']) : str(c['name_en'])))).toList(),
            onChanged: (int? v) => setState(() => _categoryId = v),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<int>(
            value: _pickupId,
            isExpanded: true,
            decoration: InputDecoration(labelText: context.t('Pickup point'), border: const OutlineInputBorder()),
            items: points.map((Map<String, dynamic> p) => DropdownMenuItem<int>(value: intOf(p['id']), child: Text(str(p['name']), overflow: TextOverflow.ellipsis))).toList(),
            onChanged: (int? v) => setState(() => _pickupId = v),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _condition,
            decoration: InputDecoration(labelText: context.t('Condition'), border: const OutlineInputBorder()),
            items: <DropdownMenuItem<String>>[
              DropdownMenuItem<String>(value: 'new', child: Text(context.t('Like new'))),
              DropdownMenuItem<String>(value: 'good', child: Text(context.t('Good'))),
              DropdownMenuItem<String>(value: 'fair', child: Text(context.t('Fair'))),
              DropdownMenuItem<String>(value: 'worn', child: Text(context.t('Well used'))),
            ],
            onChanged: (String? v) => setState(() => _condition = v ?? _condition),
          ),
          SectionTitle(context.t('How should borrowing work?')),
          ...<String>['low', 'medium', 'high'].map((String t) {
            final bool on = _tier == t;
            final String desc = t == 'low'
                ? context.t('Anyone verified can borrow right away. Best for cheap, simple things.')
                : (t == 'medium' ? context.t('You approve each request and take a photo at handover and return.') : context.t('Barangay staff approve and handle handover at the hall. For valuable items.'));
            return HiCard(
              margin: const EdgeInsets.only(bottom: 8),
              color: on ? HiColors.primarySoft : Colors.white,
              borderColor: on ? HiColors.primary : HiColors.line,
              onTap: () => setState(() => _tier = t),
              child: Row(children: <Widget>[
                Icon(on ? Icons.radio_button_checked : Icons.radio_button_off, color: on ? HiColors.primary : HiColors.muted),
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
          PrimaryButton(label: context.t('Share item'), busy: _busy, onPressed: _save),
          const SizedBox(height: 20),
        ],
      ),
    );
  }
}
