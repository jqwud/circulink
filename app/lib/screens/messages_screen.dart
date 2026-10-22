import 'package:flutter/material.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

/// The message thread of one request: borrower, owner and barangay staff.
class MessagesScreen extends StatefulWidget {
  final int requestId;
  final String title;
  const MessagesScreen({super.key, required this.requestId, required this.title});

  @override
  State<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends State<MessagesScreen> {
  final TextEditingController _text = TextEditingController();
  int _reloadTick = 0;
  bool _sending = false;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final String body = _text.text.trim();
    if (body.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await context.app.api.post('/requests/${widget.requestId}/messages', <String, dynamic>{'body': body});
      _text.clear();
      if (mounted) setState(() => _reloadTick++);
    } catch (e) {
      if (mounted) showMessage(context, context.app.errorText(e), bad: true);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: hiAppBar(context.t('Messages')),
      body: AsyncView<Map<String, dynamic>>(
        refreshKey: _reloadTick,
        loader: () async => mapOf(await context.app.api.get('/requests/${widget.requestId}/messages')),
        builder: (BuildContext ctx, Map<String, dynamic> data, Future<void> Function() reload) {
          final List<Map<String, dynamic>> messages = listOf(data['messages']);
          final bool open = boolOf(data['open']);
          return Column(
            children: <Widget>[
              Expanded(
                child: messages.isEmpty
                    ? ListView(children: <Widget>[
                        const SizedBox(height: 40),
                        EmptyState(message: ctx.t('No messages yet. Say hello and agree on the pickup.')),
                      ])
                    : ListView.builder(
                        reverse: true,
                        padding: const EdgeInsets.all(16),
                        itemCount: messages.length,
                        itemBuilder: (BuildContext c, int i) => _Bubble(message: messages[messages.length - 1 - i]),
                      ),
              ),
              if (open)
                SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(12, 6, 12, 12),
                    child: Row(children: <Widget>[
                      Expanded(
                        child: TextField(
                          controller: _text,
                          minLines: 1,
                          maxLines: 4,
                          maxLength: 500,
                          textInputAction: TextInputAction.send,
                          onSubmitted: (_) => _send(),
                          decoration: InputDecoration(
                            hintText: ctx.t('Write a message'),
                            counterText: '',
                            filled: true,
                            fillColor: Colors.white,
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(HiRadius.pill)),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton.filled(
                        tooltip: ctx.t('Send'),
                        onPressed: _sending ? null : _send,
                        style: IconButton.styleFrom(backgroundColor: HiColors.primary, foregroundColor: HiColors.onPrimary),
                        icon: const Icon(Icons.send),
                      ),
                    ]),
                  ),
                )
              else
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(ctx.t('This conversation is closed.'), style: const TextStyle(color: HiColors.muted)),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  final Map<String, dynamic> message;
  const _Bubble({required this.message});

  @override
  Widget build(BuildContext context) {
    final bool mine = boolOf(message['mine']);
    final bool staff = boolOf(message['staff']);
    final String from = staff ? context.t('Barangay staff') : str(message['from']);
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 320),
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: mine ? HiColors.primarySoft : (staff ? HiColors.infoSoft : Colors.white),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: mine ? HiColors.primarySoft : HiColors.line),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            if (!mine) Text(from, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: staff ? HiColors.info : HiColors.accent)),
            Text(str(message['body']), style: const TextStyle(color: HiColors.ink)),
            const SizedBox(height: 2),
            Text(fmtDate(str(message['created_at']), context.lang), style: const TextStyle(color: HiColors.muted, fontSize: 11)),
          ],
        ),
      ),
    );
  }
}
