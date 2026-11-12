import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/constants.dart';
import '../core/format.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import '../widgets/connection.dart';
import '../widgets/language_toggle.dart';
import 'password_screen.dart';
import 'privacy_screens.dart';

/// Me: my profile, language, privacy and settings.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final AppState app = context.watch<AppState>();
    final Map<String, dynamic> u = app.user ?? <String, dynamic>{};
    return ListView(
      padding: const EdgeInsets.fromLTRB(HiSpace.gutter, 0, HiSpace.gutter, HiSpace.xl),
      children: <Widget>[
        ScreenHeader(context.t('Me')),
        HiCard(
          child: Row(children: <Widget>[
            CircleAvatar(
              radius: 28,
              backgroundColor: HiColors.primarySoft,
              child: Text(app.firstName.isEmpty ? '?' : app.firstName[0].toUpperCase(),
                  style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: HiColors.accent)),
            ),
            const SizedBox(width: HiSpace.ms),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
                Text(str(u['name']), style: HiText.title),
                Text(str(u['email']), style: HiText.caption),
                if (str(u['phone']).isNotEmpty) Text(str(u['phone']), style: HiText.caption),
                if (str(u['student_id']).isNotEmpty) Text('${context.t('Student ID')}: ${str(u['student_id'])}', style: HiText.caption),
              ]),
            ),
            IconButton(tooltip: context.t('Edit profile'), icon: const Icon(Icons.edit_outlined), onPressed: () => _editProfile(context)),
          ]),
        ),
        if (boolOf(u['deletion_requested']))
          InfoBanner(context.t('You asked for your account to be deleted. An admin will do it soon.'), tone: Tone.warn),
        HiListTile(icon: Icons.lock_outline, label: context.t('Change password'), onTap: () => _push(context, const ChangePasswordScreen())),
        if (kShowServerTools) HiListTile(icon: Icons.settings_ethernet, label: context.t('Server address'), onTap: () => showServerDialog(context)),
        HiListTile(icon: Icons.privacy_tip_outlined, label: context.t('Privacy notice'), onTap: () => _push(context, const PrivacyScreen())),
        HiListTile(icon: Icons.download_outlined, label: context.t('My data'), onTap: () => _push(context, const MyDataScreen())),
        HiListTile(
          icon: Icons.person_remove_outlined,
          label: boolOf(u['deletion_requested']) ? context.t('Keep my account') : context.t('Delete my account'),
          danger: !boolOf(u['deletion_requested']),
          onTap: () => askToDeleteAccount(context),
        ),
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
        Text('CircuLink ${context.t('Version')} ${kAppVersion.replaceFirst('+', ' (')})', textAlign: TextAlign.center, style: const TextStyle(color: HiColors.muted, fontSize: 12)),
      ],
    );
  }

  void _push(BuildContext context, Widget page) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (BuildContext c) => page));

  Future<void> _editProfile(BuildContext context) async {
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
