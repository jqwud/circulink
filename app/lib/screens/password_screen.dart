import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import '../widgets/pawsa.dart';

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

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _again.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_next.text.length < 8) {
      setState(() => _error = context.tx('The new password needs at least 8 characters.'));
      return;
    }
    if (_next.text != _again.text) {
      setState(() => _error = context.tx('The two new passwords are not the same.'));
      return;
    }
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

  InputDecoration _field(String label) => InputDecoration(labelText: label);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: widget.forced ? null : hiAppBar(context.t('Change password')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: <Widget>[
            if (widget.forced) ...<Widget>[
              const Center(child: PawsaImage(pose: 'point', size: 110)),
              const SizedBox(height: 8),
              Text(context.t('Choose your own password'), textAlign: TextAlign.center, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Text(context.t('The barangay gave you a temporary password. Pick a new one that only you know.'), textAlign: TextAlign.center, style: const TextStyle(color: HiColors.muted)),
              const SizedBox(height: 18),
            ],
            TextField(controller: _current, obscureText: true, decoration: _field(widget.forced ? context.t('Temporary password') : context.t('Current password'))),
            const SizedBox(height: 14),
            TextField(controller: _next, obscureText: true, decoration: _field(context.t('New password')).copyWith(helperText: context.t('At least 8 characters'))),
            const SizedBox(height: 14),
            TextField(controller: _again, obscureText: true, decoration: _field(context.t('New password again'))),
            if (_error != null) ...<Widget>[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: HiColors.dangerSoft, borderRadius: BorderRadius.circular(12)),
                child: Text(_error!, style: const TextStyle(color: HiColors.danger, fontWeight: FontWeight.w600)),
              ),
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
