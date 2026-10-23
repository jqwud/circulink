import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/constants.dart';
import '../core/format.dart';
import '../core/api.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import '../widgets/connection.dart';
import '../widgets/language_toggle.dart';
import '../widgets/pawsa.dart';
import 'auth_screens.dart';
import 'help_screen.dart';
import 'impact_screen.dart';
import 'password_screen.dart';
import 'privacy_screens.dart';
import 'my_items_screen.dart';
import 'verification_screen.dart';
import 'wallet_screen.dart';

/// M16: my profile, badges, language and settings.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  static const Map<String, List<String>> _badgeText = <String, List<String>>{
    'first_lend': <String>['First Lend', 'Complete your first loan as a lender.'],
    'good_neighbor': <String>['Good Neighbor', 'Lend 3 items successfully.'],
    'on_time_star': <String>['On-time Star', 'Return 3 items on time.'],
    'repair_hero': <String>['Repair Hero', 'Share an item you fixed or reused.'],
    'zero_waste': <String>['Zero-waste Champ', 'Borrow 3 times and skip a purchase.'],
  };

  IconData _badgeIcon(String key) {
    switch (key) {
      case 'first_lend':
        return Icons.volunteer_activism;
      case 'good_neighbor':
        return Icons.favorite;
      case 'on_time_star':
        return Icons.alarm_on;
      case 'repair_hero':
        return Icons.build_circle;
      default:
        return Icons.eco;
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppState app = context.watch<AppState>();
    final Map<String, dynamic> u = app.user ?? <String, dynamic>{};
    final String v = app.verification;
    final Tone vt = v == 'approved' ? Tone.ok : (v == 'pending' ? Tone.warn : (v == 'rejected' ? Tone.bad : Tone.info));
    final String vLabel = v == 'approved'
        ? context.t('Verified')
        : (v == 'pending' ? context.t('Waiting for verification') : (v == 'rejected' ? context.t('Not approved') : context.t('Not verified')));
    return ListView(
      padding: const EdgeInsets.all(16),
      children: <Widget>[
        Row(children: <Widget>[
          const PawsaImage(pose: 'head', size: 72),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
              Text(str(u['name']), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: HiColors.ink)),
              Text('${str(u['purok'], '-')} · ${str(u['email'])}', style: const TextStyle(color: HiColors.muted, fontSize: 13)),
              const SizedBox(height: 4),
              StatusChip(vLabel, tone: vt),
            ]),
          ),
        ]),
        const SizedBox(height: 14),
        AsyncView<Map<String, dynamic>>(
          refreshKey: app.version,
          loader: () async => mapOf(await context.app.api.get('/me/badges')),
          builder: (BuildContext ctx, Map<String, dynamic> data, Future<void> Function() reload) {
            final Map<String, dynamic> stats = mapOf(data['stats']);
            final List<Map<String, dynamic>> badges = listOf(data['badges']);
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Row(children: <Widget>[
                  _stat(ctx.t('Lent'), '${intOf(stats['lent'])}'),
                  _stat(ctx.t('Borrowed'), '${intOf(stats['borrowed'])}'),
                  _stat(ctx.t('On time'), '${intOf(stats['on_time_returns'])}'),
                  _stat(ctx.t('Credits'), '${app.credits}'),
                ]),
                SectionTitle(ctx.t('My badges')),
                BadgeGrid(badges: badges, text: _badgeText, icon: _badgeIcon),
              ],
            );
          },
        ),
        const SizedBox(height: 8),
        if (!app.isApproved && v != 'pending') _tile(context, Icons.verified_user_outlined, context.t('Verify your account'), () => _push(context, const VerificationScreen())),
        _tile(context, Icons.inventory_2_outlined, context.t('My items'), () => _push(context, const MyItemsScreen())),
        _tile(context, Icons.stars_rounded, context.t('My credits'), () => _push(context, const WalletScreen())),
        _tile(context, Icons.eco_outlined, context.t('Our community impact'), () => _push(context, const ImpactScreen())),
        _tile(context, Icons.edit_outlined, context.t('Edit profile'), () => _editProfile(context)),
        _tile(context, Icons.lock_outline, context.t('Change password'), () => _push(context, const ChangePasswordScreen())),
        _tile(context, Icons.help_outline, context.t('Help and rules'), () => _push(context, const HelpScreen())),
        if (kShowServerTools) _tile(context, Icons.settings_ethernet, context.t('Server address'), () => showServerDialog(context)),
        SectionTitle(context.t('Privacy')),
        _tile(context, Icons.privacy_tip_outlined, context.t('Privacy notice'), () => _push(context, const PrivacyScreen())),
        _tile(context, Icons.download_outlined, context.t('My data'), () => _push(context, const MyDataScreen())),
        _tile(context, Icons.person_remove_outlined,
            boolOf(app.user?['deletion_requested']) ? context.t('Deletion requested. Tap to keep your account') : context.t('Delete my account'),
            () => askToDeleteAccount(context)),
        SectionTitle(context.t('Language')),
        const Align(alignment: Alignment.centerLeft, child: LanguageToggle()),
        const SizedBox(height: 18),
        SoftButton(
          label: context.t('Log out'),
          icon: Icons.logout,
          onPressed: () async {
            final bool ok = await confirmDialog(context, title: context.tx('Log out?'), message: context.tx('You can log back in any time.'), confirmLabel: context.tx('Log out'));
            if (ok && context.mounted) await context.app.logout();
          },
        ),
        const SizedBox(height: 14),
        Text('Hiraman ${context.t('Version')} ${kAppVersion.replaceFirst('+', ' (')})', textAlign: TextAlign.center, style: const TextStyle(color: HiColors.muted, fontSize: 12)),
        const SizedBox(height: 20),
      ],
    );
  }

  void _push(BuildContext context, Widget page) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (BuildContext c) => page));

  Widget _stat(String label, String value) {
    return Expanded(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 3),
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: HiColors.line)),
        child: Column(children: <Widget>[
          Text(value, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: HiColors.accent)),
          Text(label, style: const TextStyle(fontSize: 11, color: HiColors.muted)),
        ]),
      ),
    );
  }

  Widget _tile(BuildContext context, IconData icon, String label, VoidCallback onTap) => HiListTile(icon: icon, label: label, onTap: onTap);

  Future<void> _editProfile(BuildContext context) async {
    final Map<String, dynamic> u = context.app.user ?? <String, dynamic>{};
    final List<String> puroks = <String>{...context.app.puroks.isEmpty ? kPuroks : context.app.puroks, if (str(u['purok']).isNotEmpty) str(u['purok'])}.toList();
    final Map<String, dynamic>? f = await showHiSheet<Map<String, dynamic>>(context,
        title: context.tx('Edit profile'), builder: (BuildContext s) => _ProfileSheet(user: u, puroks: puroks));
    if (f == null || !context.mounted) return;
    final AppState app = context.app;
    try {
      // An empty phone clears it; the purok is sent only if it changed (a removed purok can be kept).
      await app.api.patch('/me', <String, dynamic>{
        if (str(f['name']).isNotEmpty) 'name': f['name'],
        'phone': f['phone'],
        if (f['purok'] != str(u['purok'])) 'purok': f['purok'],
      });
      await app.refreshMe();
      if (context.mounted) showMessage(context, context.tx('Profile saved.'));
    } catch (e) {
      if (context.mounted) showMessage(context, context.app.errorText(e), bad: true);
    }
  }
}

/// Name, phone and purok. The sheet owns its text fields.
class _ProfileSheet extends StatefulWidget {
  final Map<String, dynamic> user;
  final List<String> puroks;
  const _ProfileSheet({required this.user, required this.puroks});

  @override
  State<_ProfileSheet> createState() => _ProfileSheetState();
}

class _ProfileSheetState extends State<_ProfileSheet> {
  late final TextEditingController _name = TextEditingController(text: str(widget.user['name']));
  late final TextEditingController _phone = TextEditingController(text: str(widget.user['phone']));
  late String _purok = str(widget.user['purok']).isNotEmpty ? str(widget.user['purok']) : widget.puroks.first;

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
        const SizedBox(height: HiSpace.ms),
        DropdownButtonFormField<String>(
          initialValue: _purok,
          decoration: InputDecoration(labelText: context.t('Purok')),
          items: widget.puroks.map((String p) => DropdownMenuItem<String>(value: p, child: Text(p))).toList(),
          onChanged: (String? v) => setState(() => _purok = v ?? _purok),
        ),
        const SizedBox(height: HiSpace.md),
        PrimaryButton(
          label: context.t('Save'),
          onPressed: () => Navigator.pop(context, <String, dynamic>{'name': _name.text.trim(), 'phone': _phone.text.trim(), 'purok': _purok}),
        ),
        const SizedBox(height: HiSpace.sm),
        SoftButton(label: context.t('Cancel'), onPressed: () => Navigator.pop(context)),
      ],
    );
  }
}
