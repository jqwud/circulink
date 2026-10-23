import 'package:flutter/material.dart';

import '../../core/api.dart';
import '../../core/i18n.dart';
import '../../core/theme.dart';
import '../connection.dart';
import '../pawsa.dart';
import 'buttons.dart';

/// The three states of anything loaded from the server: loading, error, and empty.
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
            PawsaImage(pose: pose, size: 160),
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
    final bool net = error is ApiException && ((error as ApiException).code == 'network' || (error as ApiException).code == 'timeout');
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const PawsaImage(pose: 'oops', size: 150),
            const SizedBox(height: 12),
            Text(context.app.errorText(error), textAlign: TextAlign.center, style: const TextStyle(fontSize: 15)),
            const SizedBox(height: 16),
            if (net) const ServerStatusCard(),
            SoftButton(
              label: context.t('Try again'),
              onPressed: net ? () => context.app.findServer().then((_) => onRetry()) : onRetry,
              expand: false,
            ),
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
      if (_loading) return const Center(child: CircularProgressIndicator(color: HiColors.accent));
      return ErrorView(error: _error ?? 'error', onRetry: _load);
    }
    final Widget body = RefreshIndicator(
      color: HiColors.accent,
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
