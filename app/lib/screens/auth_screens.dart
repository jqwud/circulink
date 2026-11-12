import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/i18n.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import '../widgets/connection.dart';
import '../widgets/language_toggle.dart';
import '../widgets/brand_mark.dart';
import 'privacy_screens.dart';


/// M2: log in.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final TextEditingController _email = TextEditingController();
  final TextEditingController _password = TextEditingController();
  bool _busy = false;
  bool _hide = true;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_email.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error = context.tx('Enter your email and password.'));
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.app.login(_email.text, _password.text);
    } catch (e) {
      if (mounted) setState(() => _error = context.app.errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: <Widget>[
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: <Widget>[
                if (kShowServerTools)
                  IconButton(
                    tooltip: context.t('Server address'),
                    icon: const Icon(Icons.settings_ethernet, color: HiColors.muted),
                    onPressed: () => showServerDialog(context),
                  )
                else
                  const SizedBox(width: 48),
                const LanguageToggle(),
              ],
            ),
            const SizedBox(height: 8),
            const Center(child: BrandMark(size: 112)),
            const SizedBox(height: 8),
            const Center(child: BrandWordmark()),
            Text(context.t('Keep it in the loop.'), textAlign: TextAlign.center, style: const TextStyle(color: HiColors.muted, fontSize: 15)),
            const SizedBox(height: 20),
            const ServerStatusCard(),
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const <String>[AutofillHints.email],
              decoration: InputDecoration(labelText: context.t('Email'), prefixIcon: const Icon(Icons.mail_outline)),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _password,
              obscureText: _hide,
              onSubmitted: (_) => _submit(),
              decoration: InputDecoration(
                labelText: context.t('Password'),
                
                prefixIcon: const Icon(Icons.lock_outline),
                suffixIcon: IconButton(
                  tooltip: _hide ? context.t('Show password') : context.t('Hide password'),
                  icon: Icon(_hide ? Icons.visibility : Icons.visibility_off),
                  onPressed: () => setState(() => _hide = !_hide),
                ),
              ),
            ),
            if (_error != null) ...<Widget>[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: HiColors.dangerSoft, borderRadius: BorderRadius.circular(12)),
                child: Text(_error!, style: const TextStyle(color: HiColors.danger, fontWeight: FontWeight.w600)),
              ),
            ],
            const SizedBox(height: 18),
            PrimaryButton(label: context.t('Log in'), busy: _busy, onPressed: _submit),
            const SizedBox(height: 10),
            Center(
              child: TextButton(
                onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (BuildContext c) => const RegisterScreen())),
                child: Text(context.t('New here? Create an account'), style: const TextStyle(fontWeight: FontWeight.w800)),
              ),
            ),
            const SizedBox(height: 8),
            // Demo data only exists on test servers, so the hint shows in debug builds only.
            if (kDebugMode)
              Text(
                context.t('Demo resident: ana@circulink.test, password circulink123'),
                textAlign: TextAlign.center,
                style: const TextStyle(color: HiColors.muted, fontSize: 12),
              ),
          ],
        ),
      ),
    );
  }
}

/// Create a resident account: one per email, phone number and student ID.
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final TextEditingController _name = TextEditingController();
  final TextEditingController _email = TextEditingController();
  final TextEditingController _phone = TextEditingController();
  final TextEditingController _password = TextEditingController();
  final TextEditingController _studentId = TextEditingController();
  bool _agreed = false;

  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _phone.dispose();
    _password.dispose();
    _studentId.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_name.text.trim().length < 2 || !_email.text.contains('@') || _phone.text.trim().length < 7 || _password.text.length < 8) {
      setState(() => _error = context.tx('Please fill in your name, a valid email, your phone number and a password of at least 8 characters.'));
      return;
    }
    if (!_agreed) {
      setState(() => _error = context.tx('Please read and accept the privacy notice.'));
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.app.register(
        name: _name.text,
        email: _email.text,
        password: _password.text,
        phone: _phone.text.trim(),
        studentId: _studentId.text.trim().isEmpty ? null : _studentId.text.trim(),
        acceptPrivacy: _agreed,
      );
      if (mounted) Navigator.of(context).popUntil((Route<dynamic> r) => r.isFirst);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = context.app.errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: hiAppBar(context.t('Create an account')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: <Widget>[
            const Center(child: BrandMark(size: 80)),
            const SizedBox(height: 12),
            TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: context.t('Full name'))),
            const SizedBox(height: 14),
            TextField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: InputDecoration(labelText: context.t('Email'))),
            const SizedBox(height: 14),
            TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: InputDecoration(labelText: context.t('Phone'), helperText: context.t('One account per phone number'))),
            const SizedBox(height: 14),
            TextField(controller: _studentId, textCapitalization: TextCapitalization.characters, decoration: InputDecoration(labelText: '${context.t('Student ID')} (${context.t('Optional')})', helperText: context.t('Only if you drop off at a school hub'))),
            const SizedBox(height: 14),
            TextField(controller: _password, obscureText: true, decoration: InputDecoration(labelText: context.t('Password'), helperText: context.t('At least 8 characters'))),
            const SizedBox(height: 8),
            CheckboxListTile(
              value: _agreed,
              onChanged: (bool? v) => setState(() => _agreed = v ?? false),
              controlAffinity: ListTileControlAffinity.leading,
              contentPadding: EdgeInsets.zero,
              title: Text(context.t('I have read the privacy notice and I agree to it.')),
              subtitle: Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  style: TextButton.styleFrom(padding: EdgeInsets.zero, foregroundColor: HiColors.accent),
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (BuildContext c) => const PrivacyScreen())),
                  child: Text(context.t('Read the privacy notice')),
                ),
              ),
            ),
            if (_error != null) ...<Widget>[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: HiColors.dangerSoft, borderRadius: BorderRadius.circular(12)),
                child: Text(_error!, style: const TextStyle(color: HiColors.danger, fontWeight: FontWeight.w600)),
              ),
            ],
            const SizedBox(height: 18),
            PrimaryButton(label: context.t('Create account'), busy: _busy, onPressed: _submit),
            const SizedBox(height: 12),
            Text(
              context.t('Points are given only by hub staff after they weigh your items. They cannot be transferred or exchanged for cash.'),
              textAlign: TextAlign.center,
              style: const TextStyle(color: HiColors.muted, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }
}
