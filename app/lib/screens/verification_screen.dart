import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../core/i18n.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import '../widgets/pawsa.dart';
import '../widgets/photo.dart';

/// M3: send a photo of a government ID. Only LGU staff can see it.
class VerificationScreen extends StatefulWidget {
  const VerificationScreen({super.key});

  @override
  State<VerificationScreen> createState() => _VerificationScreenState();
}

class _VerificationScreenState extends State<VerificationScreen> {
  XFile? _file;
  Uint8List? _preview;
  bool _busy = false;

  Future<void> _pick() async {
    final XFile? f = await pickPhoto(context);
    if (f == null) return;
    final Uint8List bytes = await f.readAsBytes();
    if (mounted) {
      setState(() {
        _file = f;
        _preview = bytes;
      });
    }
  }

  Future<void> _send() async {
    if (_file == null) return;
    setState(() => _busy = true);
    try {
      await context.app.api.upload('/me/id-photo', _file!);
      await context.app.bump();
      if (!mounted) return;
      Navigator.pop(context);
      pawsaDialog(context, pose: 'happy', title: context.tx('ID sent'), message: context.tx('Barangay staff will check it. You will get a notice when you are verified.'));
    } catch (e) {
      if (mounted) showMessage(context, context.app.errorText(e), bad: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: hiAppBar(context.t('Verify your account')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: <Widget>[
          const Center(child: PawsaImage(pose: 'wink', size: 100)),
          const SizedBox(height: 12),
          Text(context.t('Only verified neighbors can borrow and lend. This keeps everyone safe.'), style: const TextStyle(fontSize: 16, height: 1.4)),
          const SizedBox(height: 14),
          HiCard(
            color: HiColors.infoSoft,
            borderColor: HiColors.infoSoft,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                _bullet(context.t('Send a clear photo of any ID that shows your name and address.')),
                _bullet(context.t('Only barangay staff can see it. Other residents never do.')),
                _bullet(context.t('You get 3 starter credits once you are verified.')),
              ],
            ),
          ),
          const SizedBox(height: 8),
          if (_preview != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(kRadius),
              child: Image.memory(_preview!, height: 200, width: double.infinity, fit: BoxFit.cover),
            ),
          const SizedBox(height: 12),
          SoftButton(label: _file == null ? context.t('Take or choose a photo') : context.t('Choose a different photo'), icon: Icons.photo_camera, onPressed: _pick),
          const SizedBox(height: 10),
          PrimaryButton(label: context.t('Send for verification'), busy: _busy, onPressed: _file == null ? null : _send),
        ],
      ),
    );
  }

  Widget _bullet(String text) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: <Widget>[
          const Icon(Icons.check, size: 18, color: HiColors.info),
          const SizedBox(width: 8),
          Expanded(child: Text(text)),
        ]),
      );
}
