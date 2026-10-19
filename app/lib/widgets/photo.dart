import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../core/api.dart';
import '../core/i18n.dart';
import '../core/theme.dart';
import 'common.dart';

/// Asks "Camera or Gallery?" and returns the chosen photo (or null if cancelled).
Future<XFile?> pickPhoto(BuildContext context) async {
  final ImageSource? source = await showModalBottomSheet<ImageSource>(
    context: context,
    builder: (BuildContext ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          ListTile(
            leading: const Icon(Icons.photo_camera, color: HiColors.primary),
            title: Text(ctx.tx('Take a photo')),
            onTap: () => Navigator.pop(ctx, ImageSource.camera),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library, color: HiColors.primary),
            title: Text(ctx.tx('Choose from gallery')),
            onTap: () => Navigator.pop(ctx, ImageSource.gallery),
          ),
        ],
      ),
    ),
  );
  if (source == null) return null;
  try {
    return await ImagePicker().pickImage(source: source, maxWidth: 1280, imageQuality: 80);
  } catch (_) {
    if (context.mounted) showMessage(context, context.tx('Could not open the camera or gallery.'), bad: true);
    return null;
  }
}

/// Picks a photo and uploads it as a public item photo. Returns its URL path.
Future<String?> pickAndUploadPhoto(BuildContext context) async {
  final XFile? file = await pickPhoto(context);
  if (file == null || !context.mounted) return null;
  showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (BuildContext ctx) => const Center(child: CircularProgressIndicator(color: HiColors.primary)),
  );
  try {
    final dynamic res = await Api.instance.upload('/uploads', file);
    if (context.mounted) Navigator.of(context, rootNavigator: true).pop();
    return (res as Map)['url'] as String?;
  } catch (e) {
    if (context.mounted) {
      Navigator.of(context, rootNavigator: true).pop();
      showMessage(context, context.app.errorText(e), bad: true);
    }
    return null;
  }
}
