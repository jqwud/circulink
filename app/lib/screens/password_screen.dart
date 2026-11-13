import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import '../widgets/brand_mark.dart';

/// Change password. With [forced] it is the gate after a staff-assisted reset: the person types the
/// temporary password once and picks their own.
class ChangePasswordScreen extends StatefulWidget {
  final bool forced;
  const ChangePasswordScreen({super.key, this.forced = false});

  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final TextEditingController _current = TextEditingController();
  final TextEditingController _next = TextEditingController();
  final TextEditingController _again = TextEditingController();
  bool _busy = false;
  String? _error;
  String? _nextError;
  String? _againError;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _again.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final String? nextError = _next.text.length < 8 ? context.tx('The new password needs at least 8 characters.') : null;
    final String? againError = nextError == null && _next.text != _again.text ? context.tx('The two new passwords are not the same.') : null;
    setState(() {
      _nextError = nextError;
      _againError = againError;
      _error = null;
    });
    if (nextError != null || againError != null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.app.changePassword(_current.text, _next.text);
      if (!mounted) return;
      if (!widget.forced) {
        Navigator.pop(context);
        showMessage(context, context.tx('Password changed. Other phones were logged out.'));
      }
    } catch (e) {
      if (mounted) setState(() => _error = context.app.errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: widget.forced ? null : hiAppBar(context.t('Change password')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: <Widget>[
            if (widget.forced) ...<Widget>[
              const Center(child: BrandMark(size: 80)),
              const SizedBox(height: 8),
              Text(context.t('Choose your own password'), textAlign: TextAlign.center, style: HiText.h1),
              const SizedBox(height: 4),
              Text(context.t('An admin gave you a temporary password. Pick a new one that only you know.'), textAlign: TextAlign.center, style: HiText.body.copyWith(color: HiColors.muted)),
              const SizedBox(height: 18),
            ],
            HiTextField(controller: _current, label: widget.forced ? context.t('Temporary password') : context.t('Current password'), obscure: true, textInputAction: TextInputAction.next, autofillHints: const <String>[AutofillHints.password]),
            const SizedBox(height: 14),
            HiTextField(controller: _next, label: context.t('New password'), helper: context.t('At least 8 characters'), error: _nextError, obscure: true, textInputAction: TextInputAction.next, autofillHints: const <String>[AutofillHints.newPassword]),
            const SizedBox(height: 14),
            HiTextField(controller: _again, label: context.t('New password again'), error: _againError, obscure: true, autofillHints: const <String>[AutofillHints.newPassword], onSubmitted: (_) => _save()),
            if (_error != null) ...<Widget>[
              const SizedBox(height: 12),
              InfoBanner(_error!, tone: Tone.bad),
            ],
            const SizedBox(height: 18),
            PrimaryButton(label: context.t('Save new password'), busy: _busy, onPressed: _save),
            if (widget.forced) ...<Widget>[
              const SizedBox(height: 8),
              SoftButton(label: context.t('Log out'), icon: Icons.logout, onPressed: _busy ? null : () => context.app.logout()),
            ],
          ],
        ),
      ),
    );
  }
}
