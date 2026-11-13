import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/constants.dart';
import '../core/format.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import '../widgets/language_toggle.dart';
import 'certificates_screen.dart';
import 'home_tab.dart';
import 'password_screen.dart';
import 'privacy_screens.dart';

/// Me: who I am and my tier (hero), my numbers (stat strip), what I unlocked (achievements), then my
/// settings in three groups. No server or developer details here.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  int _version = -1;
  late Future<dynamic> _impact;

  @override
  Widget build(BuildContext context) {
    final AppState app = context.watch<AppState>();
    final Map<String, dynamic> u = app.user ?? <String, dynamic>{};
    if (app.version != _version) {
      _version = app.version;
      _impact = app.api.get('/me/impact').catchError((Object _) => null);
    }
    final bool deleting = boolOf(u['deletion_requested']);
    return FutureBuilder<dynamic>(
      future: _impact,
      builder: (BuildContext context, AsyncSnapshot<dynamic> snap) {
        final Map<String, dynamic>? m = snap.data == null ? null : mapOf(snap.data);
        final String badge = str(m?['badge'], 'seed');
        return ListView(
          padding: const EdgeInsets.fromLTRB(HiSpace.gutter, HiSpace.md, HiSpace.gutter, HiSpace.xl),
          children: <Widget>[
            _Hero(user: u, initial: app.firstName, badge: badge, onEdit: () => ProfileActions.editProfile(context)),
            const SizedBox(height: HiSpace.md),
            _StatStrip(impact: m),
            const SizedBox(height: HiSpace.lg),
            SectionTitle(context.t('Achievements')),
            _Achievements(impact: m, badges: app.badges),
            const SizedBox(height: HiSpace.md),
            _Group(rows: <Widget>[
              _Row(icon: Icons.workspace_premium_outlined, label: context.t('My certificates'), onTap: () => _push(context, const CertificatesScreen())),
            ]),
            if (deleting) ...<Widget>[
              const SizedBox(height: HiSpace.md),
              InfoBanner(context.t('You asked for your account to be deleted. An admin will do it soon.'), tone: Tone.warn),
            ],
            const SizedBox(height: HiSpace.lg),
            SectionTitle(context.t('Account')),
            _Group(rows: <Widget>[
              _Row(icon: Icons.edit_outlined, label: context.t('Edit profile'), onTap: () => ProfileActions.editProfile(context)),
              _Row(icon: Icons.lock_outline, label: context.t('Change password'), onTap: () => _push(context, const ChangePasswordScreen())),
            ]),
            const SizedBox(height: HiSpace.lg),
            SectionTitle(context.t('Privacy')),
            _Group(rows: <Widget>[
              _Row(icon: Icons.privacy_tip_outlined, label: context.t('Privacy notice'), onTap: () => _push(context, const PrivacyScreen())),
              _Row(icon: Icons.download_outlined, label: context.t('My data'), onTap: () => _push(context, const MyDataScreen())),
              _Row(
                icon: Icons.person_remove_outlined,
                label: deleting ? context.t('Keep my account') : context.t('Delete my account'),
                danger: !deleting,
                onTap: () => askToDeleteAccount(context),
              ),
            ]),
            const SizedBox(height: HiSpace.lg),
            SectionTitle(context.t('Language')),
            const Align(alignment: Alignment.centerLeft, child: LanguageToggle()),
            const SizedBox(height: HiSpace.lg),
            SoftButton(
              label: context.t('Log out'),
              icon: Icons.logout,
              onPressed: () async {
                final bool ok = await confirmDialog(context, title: context.tx('Log out?'), message: context.tx('You can log back in any time.'), confirmLabel: context.tx('Log out'));
                if (ok && context.mounted) await context.app.logout();
              },
            ),
            const SizedBox(height: HiSpace.md),
            Text('CircuLink ${context.t('Version')} ${kAppVersion.replaceFirst('+', ' (')})', textAlign: TextAlign.center, style: HiText.caption),
          ],
        );
      },
    );
  }

  void _push(BuildContext context, Widget page) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (BuildContext c) => page));
}

/// Name, contact details and tier on a moss card. The gold ring around the initial is the tier colour.
class _Hero extends StatelessWidget {
  final Map<String, dynamic> user;
  final String initial;
  final String badge;
  final VoidCallback onEdit;
  const _Hero({required this.user, required this.initial, required this.badge, required this.onEdit});

  @override
  Widget build(BuildContext context) {
    final TextStyle soft = HiText.caption.copyWith(color: HiColors.onPrimary);
    return HiCard(
      color: HiColors.primary,
      borderColor: HiColors.primary,
      margin: EdgeInsets.zero,
      padding: const EdgeInsets.all(HiSpace.lg),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
        Container(
          padding: const EdgeInsets.all(3),
          decoration: const BoxDecoration(color: HiColors.sun, shape: BoxShape.circle),
          child: CircleAvatar(
            radius: 32,
            backgroundColor: HiColors.card,
            child: Text(initial.isEmpty ? '?' : initial[0].toUpperCase(), style: HiText.h1.copyWith(color: HiColors.accent)),
          ),
        ),
        const SizedBox(width: HiSpace.md),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
            Text(str(user['name']), style: HiText.h2.copyWith(color: HiColors.onPrimary)),
            const SizedBox(height: HiSpace.xs),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: HiSpace.ms, vertical: 4),
              decoration: BoxDecoration(color: HiColors.sun, borderRadius: BorderRadius.circular(HiRadius.pill)),
              child: Row(mainAxisSize: MainAxisSize.min, children: <Widget>[
                const ExcludeSemantics(child: Icon(Icons.eco_rounded, size: 14, color: HiColors.ink)),
                const SizedBox(width: 4),
                Text(context.tv('{badge} tier', <String, Object>{'badge': context.t(HomeTab.badgeNames[badge] ?? 'Seed')}), style: HiText.label),
              ]),
            ),
            const SizedBox(height: HiSpace.sm),
            Text(str(user['email']), style: soft),
            if (str(user['phone']).isNotEmpty) Text(str(user['phone']), style: soft),
            if (str(user['student_id']).isNotEmpty) Text('${context.t('Student ID')}: ${str(user['student_id'])}', style: soft),
          ]),
        ),
        IconButton(
          tooltip: context.t('Edit profile'),
          icon: const Icon(Icons.edit_outlined, color: HiColors.onPrimary),
          onPressed: onEdit,
        ),
      ]),
    );
  }
}

/// Three numbers side by side: kg kept in use, confirmed points, items handled.
class _StatStrip extends StatelessWidget {
  final Map<String, dynamic>? impact;
  const _StatStrip({required this.impact});

  @override
  Widget build(BuildContext context) {
    final Map<String, dynamic>? m = impact;
    Widget stat(String label, num? value, String Function(num) fmt) => Expanded(
          child: Column(children: <Widget>[
            if (value == null) Text('–', style: HiText.h2) else CountUp(value: value, format: fmt, style: HiText.h2),
            const SizedBox(height: 2),
            Text(label, textAlign: TextAlign.center, style: HiText.caption),
          ]),
        );
    const Widget divider = SizedBox(height: 36, child: VerticalDivider(width: 1, color: HiColors.line));
    return HiCard(
      margin: EdgeInsets.zero,
      padding: const EdgeInsets.symmetric(vertical: HiSpace.md, horizontal: HiSpace.sm),
      child: Row(children: <Widget>[
        stat(context.t('kept in use'), m == null ? null : ((m['kg_kept'] as num?) ?? 0), formatKg),
        divider,
        stat(context.t('points'), m == null ? null : intOf(m['points_confirmed']), (num v) => '${v.round()}'),
        divider,
        stat(context.t('items handled'), m == null ? null : intOf(m['items_sorted']), (num v) => '${v.round()}'),
      ]),
    );
  }
}

/// Tiers and personal milestones. Unlocked ones are gold; the rest are grey with a lock and say what is
/// needed, so there is always a next goal.
class _Achievements extends StatelessWidget {
  final Map<String, dynamic>? impact;
  final List<Map<String, dynamic>> badges;
  const _Achievements({required this.impact, required this.badges});

  @override
  Widget build(BuildContext context) {
    final Map<String, dynamic> m = impact ?? <String, dynamic>{};
    final int points = intOf(m['points_confirmed']);
    final num kg = (m['kg_kept'] as num?) ?? 0;
    final int items = intOf(m['items_sorted']);
    final List<({IconData icon, String title, String need, bool done})> all = <({IconData icon, String title, String need, bool done})>[
      (icon: Icons.inventory_2_rounded, title: context.t('First item'), need: context.t('Bring your first item'), done: items > 0),
      for (final Map<String, dynamic> b in badges.where((Map<String, dynamic> b) => intOf(b['min']) > 0))
        (
          icon: Icons.eco_rounded,
          title: context.t(HomeTab.badgeNames[str(b['key'])] ?? ''),
          need: context.tv('{n} points', <String, Object>{'n': intOf(b['min'])}),
          done: points >= intOf(b['min']),
        ),
      (icon: Icons.scale_rounded, title: context.t('10 kg kept'), need: context.t('Keep 10 kg in use'), done: kg >= 10),
      (icon: Icons.public_rounded, title: context.t('50 kg kept'), need: context.t('Keep 50 kg in use'), done: kg >= 50),
    ];
    return SizedBox(
      height: 132,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: all.length,
        separatorBuilder: (BuildContext c, int i) => const SizedBox(width: HiSpace.sm),
        itemBuilder: (BuildContext c, int i) {
          final ({IconData icon, String title, String need, bool done}) a = all[i];
          return Semantics(
            label: '${a.title}, ${a.done ? context.t('unlocked') : '${context.t('locked')}: ${a.need}'}',
            excludeSemantics: true,
            child: Container(
              width: 104,
              padding: const EdgeInsets.all(HiSpace.ms),
              decoration: BoxDecoration(
                color: a.done ? HiColors.sunSoft : HiColors.surfaceMuted,
                borderRadius: BorderRadius.circular(HiRadius.lg),
                border: Border.all(color: a.done ? HiColors.sun : HiColors.line),
              ),
              child: Column(children: <Widget>[
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(color: a.done ? HiColors.sun : HiColors.card, shape: BoxShape.circle),
                  child: Icon(a.done ? a.icon : Icons.lock_outline_rounded, color: a.done ? HiColors.ink : HiColors.muted, size: 22),
                ),
                const SizedBox(height: HiSpace.sm),
                Text(a.title, textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis, style: HiText.label),
                Text(a.done ? context.t('Unlocked') : a.need, textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis, style: HiText.caption),
              ]),
            ),
          );
        },
      ),
    );
  }
}

/// Several settings rows in one card, split by thin lines, instead of a card per row.
class _Group extends StatelessWidget {
  final List<Widget> rows;
  const _Group({required this.rows});

  @override
  Widget build(BuildContext context) {
    return HiCard(
      margin: EdgeInsets.zero,
      padding: EdgeInsets.zero,
      child: Column(children: <Widget>[
        for (int i = 0; i < rows.length; i++) ...<Widget>[
          if (i > 0) const Divider(height: 1, indent: 56, color: HiColors.line),
          rows[i],
        ],
      ]),
    );
  }
}

class _Row extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool danger;
  const _Row({required this.icon, required this.label, required this.onTap, this.danger = false});

  @override
  Widget build(BuildContext context) {
    final Color fg = danger ? HiColors.danger : HiColors.ink;
    return Semantics(
      button: true,
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 56),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: HiSpace.md, vertical: HiSpace.ms),
            child: Row(children: <Widget>[
              ExcludeSemantics(child: Icon(icon, color: danger ? HiColors.danger : HiColors.accent)),
              const SizedBox(width: HiSpace.md),
              Expanded(child: Text(label, style: HiText.title.copyWith(fontSize: 15, color: fg))),
              const ExcludeSemantics(child: Icon(Icons.chevron_right_rounded, color: HiColors.muted)),
            ]),
          ),
        ),
      ),
    );
  }
}

/// Profile actions shared by the hero and the Account group.
class ProfileActions {
  static Future<void> editProfile(BuildContext context) async {
    final Map<String, dynamic> u = context.app.user ?? <String, dynamic>{};
    final Map<String, dynamic>? f = await showHiSheet<Map<String, dynamic>>(context,
        title: context.tx('Edit profile'), builder: (BuildContext s) => _ProfileSheet(user: u));
    if (f == null || !context.mounted) return;
    final AppState app = context.app;
    try {
      await app.updateProfile(<String, dynamic>{
        if (str(f['name']).isNotEmpty) 'name': f['name'],
        if (str(f['phone']).isNotEmpty) 'phone': f['phone'],
      });
      if (context.mounted) showMessage(context, context.tx('Profile saved.'));
    } on ApiException catch (e) {
      if (context.mounted) showMessage(context, context.app.errorText(e), bad: true);
    }
  }
}

/// Name and phone. The student ID is fixed after sign-up (one account per student ID).
class _ProfileSheet extends StatefulWidget {
  final Map<String, dynamic> user;
  const _ProfileSheet({required this.user});

  @override
  State<_ProfileSheet> createState() => _ProfileSheetState();
}

class _ProfileSheetState extends State<_ProfileSheet> {
  late final TextEditingController _name = TextEditingController(text: str(widget.user['name']));
  late final TextEditingController _phone = TextEditingController(text: str(widget.user['phone']));

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        HiTextField(controller: _name, label: context.t('Full name'), textCapitalization: TextCapitalization.words, autofillHints: const <String>[AutofillHints.name]),
        const SizedBox(height: HiSpace.ms),
        HiTextField(controller: _phone, label: context.t('Phone'), keyboardType: TextInputType.phone, autofillHints: const <String>[AutofillHints.telephoneNumber]),
        const SizedBox(height: HiSpace.md),
        PrimaryButton(
          label: context.t('Save'),
          onPressed: () => Navigator.pop(context, <String, dynamic>{'name': _name.text.trim(), 'phone': _phone.text.trim()}),
        ),
        const SizedBox(height: HiSpace.sm),
        SoftButton(label: context.t('Cancel'), onPressed: () => Navigator.pop(context)),
      ],
    );
  }
}
