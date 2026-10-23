import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// A text field with the app's look (from the theme): the label floats above the value, a helper or
/// an error sits below. Use this instead of a TextField with its own border, so every form matches.
class HiTextField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final String? helper;
  final String? error;
  final String? hint;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final TextCapitalization textCapitalization;
  final bool obscure;
  final int minLines;
  final int maxLines;
  final int? maxLength;
  final Iterable<String>? autofillHints;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final IconData? icon;

  const HiTextField({
    super.key,
    required this.controller,
    required this.label,
    this.helper,
    this.error,
    this.hint,
    this.keyboardType,
    this.textInputAction,
    this.textCapitalization = TextCapitalization.none,
    this.obscure = false,
    this.minLines = 1,
    this.maxLines = 1,
    this.maxLength,
    this.autofillHints,
    this.onChanged,
    this.onSubmitted,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      keyboardType: keyboardType,
      textInputAction: textInputAction,
      textCapitalization: textCapitalization,
      obscureText: obscure,
      minLines: obscure ? 1 : minLines,
      maxLines: obscure ? 1 : maxLines,
      maxLength: maxLength,
      maxLengthEnforcement: MaxLengthEnforcement.enforced,
      autofillHints: autofillHints,
      onChanged: onChanged,
      onSubmitted: onSubmitted,
      decoration: InputDecoration(
        labelText: label,
        helperText: helper,
        helperMaxLines: 3,
        errorText: error,
        errorMaxLines: 3,
        hintText: hint,
        prefixIcon: icon == null ? null : Icon(icon),
      ),
    );
  }
}
