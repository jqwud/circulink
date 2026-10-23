import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';

/// Where is the Hiraman server? Over the USB cable it is localhost; on Wi-Fi or the laptop's
/// hotspot it is the computer's address, for example http://192.168.137.1:4000.
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
                TextField(controller: controller, keyboardType: TextInputType.url),
                if (result != null) ...<Widget>[
                  const SizedBox(height: 10),
                  Text(result!, style: TextStyle(fontWeight: FontWeight.w700, color: result!.startsWith('\u2713') ? HiColors.leaf : HiColors.danger)),
                ],
              ],
            ),
            actions: <Widget>[
              TextButton(
                onPressed: () async {
                  final String url = controller.text.trim().startsWith('http') ? controller.text.trim() : 'http://${controller.text.trim()}';
                  final bool ok = await Api.instance.ping(url.endsWith('/') ? url.substring(0, url.length - 1) : url);
                  setLocal(() => result = ok ? '\u2713 ${ctx2.tx('Connected')}' : '\u2717 ${ctx2.tx('Cannot reach the server')}');
                },
                child: Text(ctx2.tx('Test connection')),
              ),
              TextButton(
                onPressed: () async {
                  final AppState app = ctx2.app;
                  await app.setBaseUrl(controller.text);
                  await app.checkServer();
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

/// Says whether the app can reach the server, and what to do when it cannot.
class ServerStatusCard extends StatelessWidget {
  const ServerStatusCard({super.key});

  @override
  Widget build(BuildContext context) {
    final AppState app = context.watch<AppState>();
    final String status = app.serverStatus;
    final String host = Uri.tryParse(app.api.baseUrl)?.authority ?? app.api.baseUrl;
    final bool down = status == 'down';
    // Residents see nothing while things work, and one plain sentence when they do not.
    if (!kShowServerTools) {
      if (!down) return const SizedBox.shrink();
      return Container(
        margin: const EdgeInsets.only(bottom: 14),
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(color: HiColors.dangerSoft, borderRadius: BorderRadius.circular(HiRadius.md)),
        child: Row(children: <Widget>[
          const Icon(Icons.wifi_off_rounded, size: 20, color: HiColors.danger),
          const SizedBox(width: 10),
          Expanded(child: Text(context.t('No connection. Check your internet and try again.'), style: const TextStyle(color: HiColors.danger, fontWeight: FontWeight.w700))),
        ]),
      );
    }
    final bool ok = status == 'ok';
    final Color bg = ok ? HiColors.leafSoft : (down ? HiColors.dangerSoft : HiColors.mutedSoft);
    final Color fg = ok ? HiColors.leaf : (down ? HiColors.danger : HiColors.ink);
    final String title = ok ? '${context.t('Connected to')} $host' : (down ? context.t('Cannot reach the server') : context.t('Looking for the server...'));
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(HiRadius.md)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              if (status == 'checking')
                SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.4, color: fg))
              else
                Icon(ok ? Icons.check_circle_rounded : Icons.wifi_off_rounded, size: 20, color: fg),
              const SizedBox(width: 10),
              Expanded(child: Text(title, style: TextStyle(color: fg, fontWeight: FontWeight.w800, fontSize: 14))),
            ],
          ),
          if (down) ...<Widget>[
            const SizedBox(height: 6),
            Text(
              context.t('Plug in the USB cable, or put the phone and laptop on the same Wi-Fi or hotspot.'),
              style: const TextStyle(color: HiColors.ink, fontSize: 13, height: 1.35),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: <Widget>[
                FilledButton.tonalIcon(
                  style: FilledButton.styleFrom(minimumSize: const Size(0, 40), backgroundColor: Colors.white, foregroundColor: HiColors.ink),
                  onPressed: () => app.findServer(),
                  icon: const Icon(Icons.refresh_rounded, size: 18),
                  label: Text(context.t('Find server')),
                ),
                TextButton(onPressed: () => showServerDialog(context), child: Text(context.t('Change address'))),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
