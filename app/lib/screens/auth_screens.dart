import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/i18n.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import '../widgets/language_toggle.dart';
import '../widgets/pawsa.dart';

const List<String> kPuroks = <String>['Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5', 'Purok 6', 'Purok 7'];

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
                IconButton(
                  tooltip: context.t('Server address'),
                  icon: const Icon(Icons.settings_ethernet, color: HiColors.muted),
                  onPressed: () => showServerDialog(context),
                ),
                const LanguageToggle(),
              ],
            ),
            const SizedBox(height: 8),
            const Center(child: PawsaImage(pose: 'wink', size: 130)),
            const SizedBox(height: 8),
            const Text('Hiraman', textAlign: TextAlign.center, style: TextStyle(fontSize: 34, fontWeight: FontWeight.w900, color: HiColors.ink)),
            Text(context.t('Hiram muna, kapitbahay.'), textAlign: TextAlign.center, style: const TextStyle(color: HiColors.muted, fontSize: 15)),
            const SizedBox(height: 28),
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const <String>[AutofillHints.email],
              decoration: InputDecoration(labelText: context.t('Email'), border: const OutlineInputBorder(), prefixIcon: const Icon(Icons.mail_outline)),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _password,
              obscureText: _hide,
              onSubmitted: (_) => _submit(),
              decoration: InputDecoration(
                labelText: context.t('Password'),
                border: const OutlineInputBorder(),
                prefixIcon: const Icon(Icons.lock_outline),
                suffixIcon: IconButton(icon: Icon(_hide ? Icons.visibility : Icons.visibility_off), onPressed: () => setState(() => _hide = !_hide)),
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
            Text(
              context.t('Demo resident: ana@hiraman.test, password hiraman123'),
              textAlign: TextAlign.center,
              style: const TextStyle(color: HiColors.muted, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}

/// M2: create an account. The barangay verifies it afterwards.
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
  String _purok = kPuroks.first;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _phone.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_name.text.trim().length < 2 || !_email.text.contains('@') || _password.text.length < 6) {
      setState(() => _error = context.tx('Please fill in your name, a valid email and a password of at least 6 characters.'));
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
        phone: _phone.text.trim().isEmpty ? null : _phone.text.trim(),
        purok: _purok,
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
            const Center(child: PawsaImage(pose: 'happy', size: 90)),
            const SizedBox(height: 12),
            TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: context.t('Full name'), border: const OutlineInputBorder())),
            const SizedBox(height: 14),
            TextField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: InputDecoration(labelText: context.t('Email'), border: const OutlineInputBorder())),
            const SizedBox(height: 14),
            TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: InputDecoration(labelText: '${context.t('Phone')} (${context.t('Optional')})', border: const OutlineInputBorder())),
            const SizedBox(height: 14),
            DropdownButtonFormField<String>(
              value: _purok,
              decoration: InputDecoration(labelText: context.t('Purok'), border: const OutlineInputBorder()),
              items: kPuroks.map((String p) => DropdownMenuItem<String>(value: p, child: Text(p))).toList(),
              onChanged: (String? v) => setState(() => _purok = v ?? _purok),
            ),
            const SizedBox(height: 14),
            TextField(controller: _password, obscureText: true, decoration: InputDecoration(labelText: context.t('Password'), helperText: context.t('At least 6 characters'), border: const OutlineInputBorder())),
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
              context.t('After signing up, you send a photo of your ID. Barangay staff verify it before you can borrow or lend.'),
              textAlign: TextAlign.center,
              style: const TextStyle(color: HiColors.muted, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }
}

/// Where is the Hiraman server? On a real phone this is the computer's Wi-Fi address.
Future<void> showServerDialog(BuildContext context) async {
  final TextEditingController controller = TextEditingController(text: context.app.api.baseUrl);
  String? result;
  await showDialog<void>(
    context: context,
    builder: (BuildContext ctx) {
      return StatefulBuilder(
        builder: (BuildContext ctx2, void Function(void Function()) setLocal) {
          return AlertDialog(
            title: Text(ctx2.tx('Server address')),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  ctx2.tx('Use your computer\'s Wi-Fi address, for example http://192.168.1.10:4000. On the Android emulator use http://10.0.2.2:4000.'),
                  style: const TextStyle(fontSize: 13, color: HiColors.muted),
                ),
                const SizedBox(height: 12),
                TextField(controller: controller, keyboardType: TextInputType.url, decoration: const InputDecoration(border: OutlineInputBorder())),
                if (result != null) ...<Widget>[
                  const SizedBox(height: 10),
                  Text(result!, style: TextStyle(fontWeight: FontWeight.w700, color: result!.startsWith('✓') ? HiColors.leaf : HiColors.danger)),
                ],
              ],
            ),
            actions: <Widget>[
              TextButton(
                onPressed: () async {
                  final String url = controller.text.trim().startsWith('http') ? controller.text.trim() : 'http://${controller.text.trim()}';
                  final bool ok = await Api.instance.ping(url.endsWith('/') ? url.substring(0, url.length - 1) : url);
                  setLocal(() => result = ok ? '✓ ${ctx2.tx('Connected')}' : '✗ ${ctx2.tx('Cannot reach the server')}');
                },
                child: Text(ctx2.tx('Test connection')),
              ),
              TextButton(
                onPressed: () async {
                  await ctx2.app.setBaseUrl(controller.text);
                  if (ctx2.mounted) Navigator.pop(ctx2);
                },
                child: Text(ctx2.tx('Save'), style: const TextStyle(fontWeight: FontWeight.w800)),
              ),
            ],
          );
        },
      );
    },
  );
  controller.dispose();
}
