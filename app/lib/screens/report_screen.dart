import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

/// M17: report an item, a person or a loan to the barangay.
class ReportScreen extends StatefulWidget {
  final String targetType; // item | user | request
  final int targetId;
  final String subject;
  const ReportScreen({super.key, required this.targetType, required this.targetId, required this.subject});

  @override
  State<ReportScreen> createState() => _ReportScreenState();
}

class _ReportScreenState extends State<ReportScreen> {
  static const List<String> _reasons = <String>['Item is not as described', 'Unsafe or prohibited item', 'Did not show up', 'Rude or unsafe behavior', 'Something else'];
  String _reason = _reasons.first;
  final TextEditingController _details = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() => _busy = true);
    try {
      await context.app.api.post('/reports', <String, dynamic>{
        'target_type': widget.targetType,
        'target_id': widget.targetId,
        'reason': _reason,
        'details': _details.text.trim().isEmpty ? null : _details.text.trim(),
      });
      if (!mounted) return;
      Navigator.pop(context);
      pawsaDialog(context, pose: 'happy', title: context.tx('Report sent'), message: context.tx('Thank you. Barangay staff will look into it.'));
    } catch (e) {
      if (mounted) showMessage(context, context.app.errorText(e), bad: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: hiAppBar(context.t('Report a problem')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: <Widget>[
          Text(widget.subject, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
          const SizedBox(height: 12),
          Text(context.t('What happened?'), style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: _reasons
                .map((String r) => ChoiceChip(
                      label: Text(context.t(r)),
                      selected: _reason == r,
                      showCheckmark: false,
                      selectedColor: HiColors.primarySoft,
                      onSelected: (_) => setState(() => _reason = r),
                    ))
                .toList(),
          ),
          const SizedBox(height: 14),
          TextField(controller: _details, maxLines: 4, decoration: InputDecoration(labelText: context.t('Details (optional)'), border: const OutlineInputBorder())),
          const SizedBox(height: 16),
          PrimaryButton(label: context.t('Send report'), busy: _busy, onPressed: _send),
        ],
      ),
    );
  }
}
