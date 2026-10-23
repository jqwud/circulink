import 'package:flutter/material.dart';

import '../../core/i18n.dart';
import '../../core/theme.dart';
import 'buttons.dart';
import 'hi_field.dart';
import 'hi_sheet.dart';

/// Asks for a short text in a bottom sheet: a reason for rejecting, a problem to report.
/// Returns the trimmed text ('' when it is optional and left empty), or null when the person cancels.
Future<String?> askText(
  BuildContext context, {
  required String title,
  required String label,
  required String confirmLabel,
  String? message,
  bool required = false,
  bool danger = false,
  int maxLength = 300,
}) {
  return showHiSheet<String>(
    context,
    title: title,
    builder: (BuildContext s) => _AskText(label: label, confirmLabel: confirmLabel, message: message, required: required, danger: danger, maxLength: maxLength),
  );
}

// The sheet owns its text field, so the field lives exactly as long as the sheet (closing animation included).
class _AskText extends StatefulWidget {
  final String label;
  final String confirmLabel;
  final String? message;
  final bool required;
  final bool danger;
  final int maxLength;
  const _AskText({required this.label, required this.confirmLabel, this.message, required this.required, required this.danger, required this.maxLength});

  @override
  State<_AskText> createState() => _AskTextState();
}

class _AskTextState extends State<_AskText> {
  final TextEditingController _text = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  void _submit() {
    final String value = _text.text.trim();
    if (widget.required && value.isEmpty) {
      setState(() => _error = context.tx('Please write a few words.'));
      return;
    }
    Navigator.pop(context, value);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        if (widget.message != null) ...<Widget>[Text(widget.message!, style: HiText.body), const SizedBox(height: HiSpace.ms)],
        HiTextField(controller: _text, label: widget.label, minLines: 2, maxLines: 4, maxLength: widget.maxLength, error: _error, textCapitalization: TextCapitalization.sentences),
        const SizedBox(height: HiSpace.md),
        PrimaryButton(label: widget.confirmLabel, danger: widget.danger, onPressed: _submit),
        const SizedBox(height: HiSpace.sm),
        SoftButton(label: context.t('Cancel'), onPressed: () => Navigator.pop(context)),
      ],
    );
  }
}
