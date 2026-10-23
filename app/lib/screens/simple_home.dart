import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import '../widgets/pawsa.dart';
import 'add_item_screen.dart';
import 'browse_screen.dart';
import 'help_screen.dart';
import 'notifications_screen.dart';
import 'profile_screen.dart';
import 'requests_screen.dart';

/// Simple mode (Hiraman 2.0): for seniors and PWDs. Four big buttons instead of the bottom bar: Borrow,
/// My loans, Give, Help. Each opens the usual screen with a clear back button; nothing needs a swipe.
class SimpleHome extends StatelessWidget {
  const SimpleHome({super.key});

  void _open(BuildContext context, String title, Widget body) {
    Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (BuildContext c) => Scaffold(appBar: hiAppBar(title), body: SafeArea(child: body)),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final AppState app = context.watch<AppState>();
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: <Widget>[
            Row(children: <Widget>[
              const PawsaImage(pose: 'happy', size: 72),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
                  Text('${context.t('Hello')}, ${app.firstName}!', style: HiText.h1),
                  Text(context.tv('You have {n} credits.', <String, Object>{'n': app.credits}), style: const TextStyle(color: HiColors.muted)),
                ]),
              ),
            ]),
            const SizedBox(height: 16),
            _BigButton(icon: Icons.search, label: context.t('Borrow'), hint: context.t('Find something to borrow'),
                onTap: () => _open(context, context.t('Borrow'), const BrowseScreen())),
            _BigButton(icon: Icons.swap_horiz, label: context.t('My loans'), hint: context.t('What you borrow and lend'),
                onTap: () => _open(context, context.t('My loans'), const RequestsScreen())),
            _BigButton(icon: Icons.volunteer_activism, label: context.t('Give'), hint: context.t('Lend or give something away'),
                onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (BuildContext c) => const AddItemScreen(startGiving: true)))),
            _BigButton(icon: Icons.support_agent, label: context.t('Help'), hint: context.t('How Hiraman works, and calling the barangay'),
                onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (BuildContext c) => const HelpScreen()))),
            const SizedBox(height: 8),
            Row(children: <Widget>[
              Expanded(
                child: SoftButton(
                  label: app.unread > 0 ? '${context.t('Notifications')} (${app.unread})' : context.t('Notifications'),
                  icon: Icons.notifications_none,
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (BuildContext c) => const NotificationsScreen())),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: SoftButton(label: context.t('Me'), icon: Icons.person_outline, onPressed: () => _open(context, context.t('Me'), const ProfileScreen())),
              ),
            ]),
          ],
        ),
      ),
    );
  }
}

/// One of the four big buttons: at least 96 dp tall, an icon, a name and one line saying what it does.
class _BigButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final String hint;
  final VoidCallback onTap;
  const _BigButton({required this.icon, required this.label, required this.hint, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Semantics(
        button: true,
        label: '$label. $hint',
        child: ExcludeSemantics(
          child: Material(
            color: HiColors.primary,
            borderRadius: BorderRadius.circular(HiRadius.lg),
            child: InkWell(
              borderRadius: BorderRadius.circular(HiRadius.lg),
              onTap: onTap,
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 96),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                  child: Row(children: <Widget>[
                    Icon(icon, size: 40, color: HiColors.onPrimary),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: <Widget>[
                        Text(label, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: HiColors.onPrimary)),
                        Text(hint, style: const TextStyle(fontSize: 15, color: HiColors.onPrimary)),
                      ]),
                    ),
                  ]),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
