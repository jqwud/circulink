import 'package:flutter/material.dart';

import '../core/format.dart';
import '../core/i18n.dart';
import '../core/theme.dart';
import 'pawsa.dart';

enum Tone { ok, warn, bad, info, muted }

Color toneBg(Tone t) {
  switch (t) {
    case Tone.ok:
      return HiColors.leafSoft;
    case Tone.warn:
      return HiColors.warnSoft;
    case Tone.bad:
      return HiColors.dangerSoft;
    case Tone.info:
      return HiColors.infoSoft;
    case Tone.muted:
      return HiColors.mutedSoft;
  }
}

Color toneFg(Tone t) {
  switch (t) {
    case Tone.ok:
      return HiColors.leaf;
    case Tone.warn:
      return HiColors.warn;
    case Tone.bad:
      return HiColors.danger;
    case Tone.info:
      return HiColors.info;
    case Tone.muted:
      return HiColors.muted;
  }
}

class StatusChip extends StatelessWidget {
  final String label;
  final Tone tone;
  const StatusChip(this.label, {super.key, this.tone = Tone.muted});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(color: toneBg(tone), borderRadius: BorderRadius.circular(99)),
      child: Text(label, style: TextStyle(color: toneFg(tone), fontSize: 12, fontWeight: FontWeight.w800)),
    );
  }
}

class HiCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry margin;
  final VoidCallback? onTap;
  final Color? color;
  final Color? borderColor;

  const HiCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.margin = const EdgeInsets.only(bottom: 12),
    this.onTap,
    this.color,
    this.borderColor,
  });

  @override
  Widget build(BuildContext context) {
    final BorderRadius radius = BorderRadius.circular(kRadius);
    return Padding(
      padding: margin,
      child: Material(
        color: color ?? HiColors.card,
        borderRadius: radius,
        child: InkWell(
          borderRadius: radius,
          onTap: onTap,
          child: Container(
            width: double.infinity,
            padding: padding,
            decoration: BoxDecoration(borderRadius: radius, border: Border.all(color: borderColor ?? HiColors.line)),
            child: child,
          ),
        ),
      ),
    );
  }
}

class PrimaryButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool busy;
  final bool danger;

  const PrimaryButton({super.key, required this.label, required this.onPressed, this.icon, this.busy = false, this.danger = false});

  @override
  Widget build(BuildContext context) {
    final ButtonStyle style = FilledButton.styleFrom(
      backgroundColor: danger ? HiColors.danger : HiColors.primary,
      foregroundColor: Colors.white,
      minimumSize: const Size(0, 52),
      shape: const StadiumBorder(),
      textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
    );
    final Widget content = busy
        ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 3, color: Colors.white))
        : (icon == null
            ? Text(label)
            : Row(mainAxisSize: MainAxisSize.min, children: <Widget>[Icon(icon, size: 20), const SizedBox(width: 8), Text(label)]));
    return SizedBox(
      width: double.infinity,
      child: FilledButton(style: style, onPressed: busy ? null : onPressed, child: content),
    );
  }
}

class SoftButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool expand;

  const SoftButton({super.key, required this.label, required this.onPressed, this.icon, this.expand = true});

  @override
  Widget build(BuildContext context) {
    final ButtonStyle style = OutlinedButton.styleFrom(
      foregroundColor: HiColors.ink,
      side: const BorderSide(color: HiColors.line, width: 1.5),
      minimumSize: const Size(0, 48),
      shape: const StadiumBorder(),
      textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
    );
    final Widget content = icon == null
        ? Text(label)
        : Row(mainAxisSize: MainAxisSize.min, children: <Widget>[Icon(icon, size: 18), const SizedBox(width: 8), Text(label)]);
    final Widget button = OutlinedButton(style: style, onPressed: onPressed, child: content);
    return expand ? SizedBox(width: double.infinity, child: button) : button;
  }
}

class SectionTitle extends StatelessWidget {
  final String text;
  final Widget? trailing;
  const SectionTitle(this.text, {super.key, this.trailing});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 8, 4, 10),
      child: Row(
        children: <Widget>[
          Expanded(child: Text(text, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: HiColors.ink))),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  final String pose;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  const EmptyState({super.key, this.pose = 'sleepy', required this.message, this.actionLabel, this.onAction});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            PawsaImage(pose: pose, size: 120),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center, style: const TextStyle(color: HiColors.muted, fontSize: 15)),
            if (actionLabel != null && onAction != null) ...<Widget>[
              const SizedBox(height: 16),
              SoftButton(label: actionLabel!, onPressed: onAction, expand: false),
            ],
          ],
        ),
      ),
    );
  }
}

class ErrorView extends StatelessWidget {
  final Object error;
  final VoidCallback onRetry;
  const ErrorView({super.key, required this.error, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const PawsaImage(pose: 'oops', size: 110),
            const SizedBox(height: 12),
            Text(context.app.errorText(error), textAlign: TextAlign.center, style: const TextStyle(fontSize: 15)),
            const SizedBox(height: 16),
            SoftButton(label: context.t('Try again'), onPressed: onRetry, expand: false),
          ],
        ),
      ),
    );
  }
}

/// Loads data, shows a spinner, an error with a retry button, or the content.
/// Pull down to refresh. Change [refreshKey] to make it reload by itself.
class AsyncView<T> extends StatefulWidget {
  final Future<T> Function() loader;
  final Widget Function(BuildContext context, T data, Future<void> Function() reload) builder;
  final Object? refreshKey;

  const AsyncView({super.key, required this.loader, required this.builder, this.refreshKey});

  @override
  State<AsyncView<T>> createState() => _AsyncViewState<T>();
}

class _AsyncViewState<T> extends State<AsyncView<T>> {
  T? _data;
  Object? _error;
  bool _loading = true;
  int _ticket = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(AsyncView<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.refreshKey != widget.refreshKey) _load();
  }

  Future<void> _load() async {
    final int ticket = ++_ticket;
    if (_data != null && mounted) {
      setState(() => _error = null);
    }
    try {
      final T d = await widget.loader();
      if (!mounted || ticket != _ticket) return;
      setState(() {
        _data = d;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted || ticket != _ticket) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_data == null) {
      if (_loading) return const Center(child: CircularProgressIndicator(color: HiColors.primary));
      return ErrorView(error: _error ?? 'error', onRetry: _load);
    }
    final Widget body = RefreshIndicator(
      color: HiColors.primary,
      onRefresh: _load,
      child: widget.builder(context, _data as T, _load),
    );
    if (_error == null) return body;
    return Column(
      children: <Widget>[
        Container(
          width: double.infinity,
          color: HiColors.warnSoft,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Text(context.app.errorText(_error!), style: const TextStyle(color: HiColors.warn, fontSize: 13)),
        ),
        Expanded(child: body),
      ],
    );
  }
}

void showMessage(BuildContext context, String text, {bool bad = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(text),
      backgroundColor: bad ? HiColors.danger : HiColors.ink,
      behavior: SnackBarBehavior.floating,
    ));
}

Future<bool> confirmDialog(BuildContext context, {required String title, required String message, required String confirmLabel, bool danger = false}) async {
  final bool? ok = await showDialog<bool>(
    context: context,
    builder: (BuildContext ctx) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: <Widget>[
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(ctx.tx('Cancel'))),
        TextButton(
          onPressed: () => Navigator.pop(ctx, true),
          child: Text(confirmLabel, style: TextStyle(color: danger ? HiColors.danger : HiColors.primary, fontWeight: FontWeight.w800)),
        ),
      ],
    ),
  );
  return ok == true;
}

/// A dialog with Pawsa on top, used after an important action.
Future<void> pawsaDialog(BuildContext context, {required String pose, required String title, required String message}) {
  return showDialog<void>(
    context: context,
    builder: (BuildContext ctx) => AlertDialog(
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          PawsaImage(pose: pose, size: 110),
          const SizedBox(height: 8),
          Text(title, textAlign: TextAlign.center, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Text(message, textAlign: TextAlign.center),
        ],
      ),
      actions: <Widget>[TextButton(onPressed: () => Navigator.pop(ctx), child: Text(ctx.tx('OK')))],
    ),
  );
}

// ---------- item and request building blocks ----------

IconData categoryIcon(String? slug) {
  switch (slug) {
    case 'party':
      return Icons.celebration;
    case 'tools':
      return Icons.build;
    case 'school':
      return Icons.school;
    case 'travel':
      return Icons.luggage;
    default:
      return Icons.category;
  }
}

String costLabel(BuildContext context, int cost) {
  if (cost == 0) return context.t('Free');
  return cost == 1 ? '1 ${context.t('credit')}' : '$cost ${context.t('credits')}';
}

String tierLabel(BuildContext context, String tier) {
  switch (tier) {
    case 'medium':
      return context.t('Owner approves');
    case 'high':
      return context.t('Barangay hall');
    default:
      return context.t('Quick borrow');
  }
}

Tone tierTone(String tier) {
  switch (tier) {
    case 'medium':
      return Tone.warn;
    case 'high':
      return Tone.bad;
    default:
      return Tone.ok;
  }
}

Tone statusTone(String status) {
  switch (status) {
    case 'pending':
      return Tone.warn;
    case 'approved':
      return Tone.ok;
    case 'handed_over':
      return Tone.info;
    case 'closed':
      return Tone.ok;
    case 'rejected':
    case 'disputed':
      return Tone.bad;
    default:
      return Tone.muted;
  }
}

String statusLabel(BuildContext context, String status) {
  switch (status) {
    case 'pending':
      return context.t('Waiting for approval');
    case 'approved':
      return context.t('Approved');
    case 'rejected':
      return context.t('Not approved');
    case 'cancelled':
      return context.t('Cancelled');
    case 'handed_over':
      return context.t('Borrowed');
    case 'closed':
      return context.t('Returned');
    case 'disputed':
      return context.t('Under review');
    default:
      return status;
  }
}

class ItemThumb extends StatelessWidget {
  final Map<String, dynamic> item;
  final double size;
  const ItemThumb({super.key, required this.item, this.size = 72});

  @override
  Widget build(BuildContext context) {
    final String photo = context.app.api.absolute(item['photo_url'] as String?);
    final String slug = str(mapOf(item['category'])['slug']);
    final Widget placeholder = Container(
      width: size,
      height: size,
      color: HiColors.primarySoft,
      child: Icon(categoryIcon(slug), color: HiColors.primary, size: size * 0.45),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: photo.isEmpty
          ? placeholder
          : Image.network(photo, width: size, height: size, fit: BoxFit.cover, errorBuilder: (BuildContext c, Object e, StackTrace? s) => placeholder),
    );
  }
}

class ItemCard extends StatelessWidget {
  final Map<String, dynamic> item;
  final VoidCallback onTap;
  const ItemCard({super.key, required this.item, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final bool shelf = boolOf(item['is_shelf']);
    final Map<String, dynamic> owner = mapOf(item['owner']);
    final Map<String, dynamic> pickup = mapOf(item['pickup_point']);
    final String tier = str(item['tier'], 'low');
    final String who = shelf ? context.t('Barangay Shelf') : '${str(owner['name'])} · ${str(owner['purok'], '-')}';
    return HiCard(
      onTap: onTap,
      padding: const EdgeInsets.all(12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          ItemThumb(item: item),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(str(item['title']), maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                const SizedBox(height: 2),
                Text(who, style: const TextStyle(color: HiColors.muted, fontSize: 13)),
                if (pickup.isNotEmpty) Text(str(pickup['name']), style: const TextStyle(color: HiColors.muted, fontSize: 12)),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: <Widget>[
                    StatusChip(tierLabel(context, tier), tone: tierTone(tier)),
                    StatusChip(costLabel(context, intOf(item['credit_cost'])), tone: Tone.muted),
                    if (boolOf(item['is_out'])) StatusChip(context.t('Borrowed'), tone: Tone.info),
                    if (boolOf(item['repair_reuse'])) StatusChip(context.t('Repair and Reuse'), tone: Tone.ok),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class RequestCard extends StatelessWidget {
  final Map<String, dynamic> request;
  final VoidCallback onTap;
  const RequestCard({super.key, required this.request, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final Map<String, dynamic> item = mapOf(request['item']);
    final Map<String, dynamic> owner = mapOf(request['owner']);
    final Map<String, dynamic> borrower = mapOf(request['borrower']);
    final String status = str(request['status']);
    final bool asOwner = request['my_role'] == 'owner';
    final String who = asOwner
        ? '${context.t('Borrower')}: ${str(borrower['name'])}'
        : '${context.t('Lender')}: ${owner.isEmpty ? context.t('Barangay Shelf') : str(owner['name'])}';
    return HiCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(child: Text(str(item['title']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
              StatusChip(statusLabel(context, status), tone: statusTone(status)),
            ],
          ),
          const SizedBox(height: 6),
          Text(fmtRange(str(request['start_date']), str(request['end_date']), context.lang), style: const TextStyle(color: HiColors.ink)),
          const SizedBox(height: 2),
          Text(who, style: const TextStyle(color: HiColors.muted, fontSize: 13)),
          if (boolOf(request['overdue'])) ...<Widget>[
            const SizedBox(height: 6),
            StatusChip(context.t('Overdue'), tone: Tone.bad),
          ],
        ],
      ),
    );
  }
}
