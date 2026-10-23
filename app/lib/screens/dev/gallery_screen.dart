import 'package:flutter/material.dart';

import '../../core/theme.dart';
import '../../widgets/common.dart';

/// Every design token and component on one screen, to check the look in one place (debug builds only,
/// opened from Profile). Developer tool: the labels here are English on purpose. See docs/DESIGN_SYSTEM.md.
class GalleryScreen extends StatefulWidget {
  const GalleryScreen({super.key});

  @override
  State<GalleryScreen> createState() => _GalleryScreenState();
}

class _GalleryScreenState extends State<GalleryScreen> {
  final TextEditingController _a = TextEditingController(text: 'Folding chairs');
  final TextEditingController _b = TextEditingController();
  final TextEditingController _c = TextEditingController(text: 'abc');
  int _tab = 0;

  @override
  void dispose() {
    _a.dispose();
    _b.dispose();
    _c.dispose();
    super.dispose();
  }

  static const Map<String, Color> _colors = <String, Color>{
    'primary': HiColors.primary, 'primarySoft': HiColors.primarySoft, 'accent': HiColors.accent, 'sun': HiColors.sun,
    'cream': HiColors.cream, 'ink': HiColors.ink, 'muted': HiColors.muted, 'line': HiColors.line,
    'leaf': HiColors.leaf, 'warn': HiColors.warn, 'danger': HiColors.danger, 'info': HiColors.info,
  };

  static final Map<String, dynamic> _item = <String, dynamic>{
    'title': 'Folding chairs (set of 12)', 'is_shelf': false, 'tier': 'medium', 'credit_cost': 1, 'is_out': true, 'repair_reuse': true,
    'owner': <String, dynamic>{'name': 'Ana', 'purok': 'Purok 1'}, 'pickup_point': <String, dynamic>{'name': 'Barangay Hall'},
    'category': <String, dynamic>{'slug': 'party'},
  };

  static final Map<String, dynamic> _request = <String, dynamic>{
    'item': <String, dynamic>{'title': 'Bluetooth speaker'}, 'status': 'handed_over', 'my_role': 'borrower',
    'start_date': '2026-10-21', 'end_date': '2026-10-23', 'owner': <String, dynamic>{'name': 'Ana'}, 'borrower': <String, dynamic>{'name': 'Ben'},
    'overdue': true, 'checkin': <String, dynamic>{'due_today': true},
  };

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(top: HiSpace.lg, bottom: HiSpace.sm),
        child: Text(text, style: HiText.label.copyWith(color: HiColors.muted, letterSpacing: 0.6)),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: hiAppBar('Component gallery'),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(HiSpace.gutter, 0, HiSpace.gutter, HiSpace.xl),
        children: <Widget>[
          _label('COLORS'),
          Wrap(spacing: 8, runSpacing: 8, children: <Widget>[
            for (final MapEntry<String, Color> c in _colors.entries)
              Column(mainAxisSize: MainAxisSize.min, children: <Widget>[
                Container(width: 56, height: 40, decoration: BoxDecoration(color: c.value, borderRadius: BorderRadius.circular(HiRadius.sm), border: Border.all(color: HiColors.line))),
                Text(c.key, style: HiText.caption),
              ]),
          ]),
          _label('TYPE'),
          const Text('Display 32', style: HiText.display),
          const Text('Heading 24', style: HiText.h1),
          const Text('Heading 20', style: HiText.h2),
          const Text('Title 17', style: HiText.title),
          const Text('Body 15: plain sentences, short and kind.', style: HiText.body),
          const Text('Label 13', style: HiText.label),
          const Text('Caption 12', style: HiText.caption),
          _label('BUTTONS'),
          PrimaryButton(label: 'Primary', icon: Icons.check, onPressed: () {}),
          const SizedBox(height: 8),
          const PrimaryButton(label: 'Busy', busy: true, onPressed: null),
          const SizedBox(height: 8),
          PrimaryButton(label: 'Danger', danger: true, onPressed: () {}),
          const SizedBox(height: 8),
          SoftButton(label: 'Soft', icon: Icons.edit, onPressed: () {}),
          const SizedBox(height: 8),
          const SoftButton(label: 'Disabled', onPressed: null),
          _label('CHIPS'),
          const Wrap(spacing: 6, runSpacing: 6, children: <Widget>[
            StatusChip('Approved', tone: Tone.ok),
            StatusChip('Waiting', tone: Tone.warn),
            StatusChip('Overdue', tone: Tone.bad),
            StatusChip('Borrowed', tone: Tone.info),
            StatusChip('1 credit'),
          ]),
          _label('TABS'),
          HiTabs(tabs: const <HiTab>[HiTab('Borrowing'), HiTab('Lending', count: 2)], index: _tab, onChanged: (int i) => setState(() => _tab = i)),
          _label('BANNERS'),
          const InfoBanner('Waiting for the owner to approve. Your credit is held.'),
          const InfoBanner('Return it by Friday to keep your credits.', tone: Tone.warn),
          const InfoBanner('Return confirmed. Credits were updated.', tone: Tone.ok),
          const InfoBanner('This item is out on loan.', tone: Tone.bad),
          _label('FIELDS'),
          HiTextField(controller: _a, label: 'Item name'),
          const SizedBox(height: 12),
          HiTextField(controller: _b, label: 'Password', helper: 'At least 8 characters', obscure: true),
          const SizedBox(height: 12),
          HiTextField(controller: _c, label: 'Phone', error: 'Enter a phone number with digits only.', keyboardType: TextInputType.phone),
          _label('CARDS AND ROWS'),
          const HiCard(child: Text('A white card on a soft shadow.')),
          const HiCard(color: HiColors.sunSoft, borderColor: HiColors.sun, child: Text('A tinted card with a border.')),
          const HiCard(child: Column(children: <Widget>[KeyValueRow('Dates', 'Oct 21 - Oct 23, 2026'), KeyValueRow('Lender', 'Ana')])),
          HiListTile(icon: Icons.lock_outline, label: 'Change password', onTap: () {}),
          HiListTile(icon: Icons.person_remove_outlined, label: 'Delete my account', subtitle: 'A request the barangay handles', danger: true, onTap: () {}),
          SectionTitle('Section title', trailing: TextButton(onPressed: () {}, child: const Text('See all'))),
          ItemCard(item: _item, onTap: () {}),
          RequestCard(request: _request, onTap: () {}),
          _label('BADGES'),
          BadgeGrid(
            badges: const <Map<String, dynamic>>[
              <String, dynamic>{'key': 'first_lend', 'earned': true},
              <String, dynamic>{'key': 'good_neighbor', 'earned': true},
              <String, dynamic>{'key': 'on_time_star', 'earned': false},
              <String, dynamic>{'key': 'repair_hero', 'earned': false},
              <String, dynamic>{'key': 'zero_waste', 'earned': false},
            ],
            text: const <String, List<String>>{
              'first_lend': <String>['First Lend', 'Complete your first loan as a lender.'],
              'good_neighbor': <String>['Good Neighbor', 'Lend 3 items successfully.'],
              'on_time_star': <String>['On-time Star', 'Return 3 items on time.'],
              'repair_hero': <String>['Repair Hero', 'Share an item you fixed or reused.'],
              'zero_waste': <String>['Zero-waste Champ', 'Borrow 3 times and skip a purchase.'],
            },
            icon: (String k) => Icons.volunteer_activism,
          ),
          _label('STATES'),
          const SizedBox(height: 260, child: SkeletonList(count: 2)),
          const EmptyState(message: 'Nothing here yet.'),
          const Center(child: KasamaBadge()),
          _label('FEEDBACK'),
          Wrap(spacing: 8, runSpacing: 8, children: <Widget>[
            SoftButton(expand: false, label: 'Message', onPressed: () => showMessage(context, 'Saved.')),
            SoftButton(expand: false, label: 'Confirm', onPressed: () => confirmDialog(context, title: 'Remove this item?', message: 'Neighbors will no longer see it.', confirmLabel: 'Remove', danger: true)),
            SoftButton(expand: false, label: 'Pawsa', onPressed: () => pawsaDialog(context, pose: 'cheer', title: 'Thank you!', message: 'Your item is now shared.')),
            SoftButton(
              expand: false,
              label: 'Sheet',
              onPressed: () => showHiSheet<void>(context, title: 'Reject this request?', builder: (BuildContext c) => Column(children: <Widget>[
                    HiTextField(controller: TextEditingController(), label: 'Reason (optional)'),
                    const SizedBox(height: 12),
                    PrimaryButton(label: 'Reject', danger: true, onPressed: () => Navigator.pop(c)),
                  ])),
            ),
          ]),
        ],
      ),
    );
  }
}
