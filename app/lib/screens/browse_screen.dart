import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/constants.dart';
import '../core/format.dart';
import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import 'add_item_screen.dart';
import 'item_detail.dart';

/// M5: search and filter what neighbors (and the barangay) are sharing.
class BrowseScreen extends StatefulWidget {
  const BrowseScreen({super.key});

  @override
  State<BrowseScreen> createState() => _BrowseScreenState();
}

class _BrowseScreenState extends State<BrowseScreen> {
  final TextEditingController _search = TextEditingController();
  Timer? _debounce;
  String _text = '';
  int? _categoryId;
  bool _shelfOnly = false;

  // Items come 30 at a time; "Load more" fetches the next page.
  static const int _page = kBrowsePageSize;
  final List<Map<String, dynamic>> _more = <Map<String, dynamic>>[];
  bool _hasMore = false;
  bool _loadingMore = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onText(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      if (mounted) setState(() => _text = v.trim());
    });
  }

  Map<String, String> _query(int offset) {
    final Map<String, String> query = <String, String>{'owner': 'others', 'limit': '$_page', 'offset': '$offset'};
    if (_text.isNotEmpty) query['q'] = _text;
    if (_categoryId != null) query['category_id'] = '$_categoryId';
    if (_shelfOnly) query['shelf'] = '1';
    return query;
  }

  Future<List<Map<String, dynamic>>> _load() async {
    final List<Map<String, dynamic>> first = listOf(await context.app.api.get('/items', query: _query(0)));
    _more.clear();
    _hasMore = first.length == _page;
    return first;
  }

  Future<void> _loadMore(int shown) async {
    setState(() => _loadingMore = true);
    try {
      final List<Map<String, dynamic>> next = listOf(await context.app.api.get('/items', query: _query(shown)));
      if (!mounted) return;
      setState(() {
        _more.addAll(next);
        _hasMore = next.length == _page;
      });
    } catch (e) {
      if (mounted) showMessage(context, context.app.errorText(e), bad: true);
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppState app = context.watch<AppState>();
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'fab-browse', // each tab stays built (IndexedStack), so each button needs its own tag
        backgroundColor: HiColors.primary,
        foregroundColor: HiColors.onPrimary,
        icon: const Icon(Icons.add),
        label: Text(context.t('Share an item')),
        onPressed: () {
          if (!app.isApproved) {
            showMessage(context, context.tx('Verify your account first to share items.'), bad: true);
            return;
          }
          Navigator.of(context).push(MaterialPageRoute<void>(builder: (BuildContext c) => const AddItemScreen()));
        },
      ),
      body: Column(
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: TextField(
              controller: _search,
              onChanged: _onText,
              decoration: InputDecoration(
                hintText: context.t('Search chairs, ladder, calculator...'),
                prefixIcon: const Icon(Icons.search),
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(99), borderSide: const BorderSide(color: HiColors.line)),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(99), borderSide: const BorderSide(color: HiColors.line)),
              ),
            ),
          ),
          SizedBox(
            height: 46,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: <Widget>[
                _chip(context.t('All'), _categoryId == null && !_shelfOnly, () => setState(() {
                      _categoryId = null;
                      _shelfOnly = false;
                    })),
                _chip(context.t('Barangay Shelf'), _shelfOnly, () => setState(() {
                      _shelfOnly = !_shelfOnly;
                      _categoryId = null;
                    })),
                ...app.categories.map((Map<String, dynamic> c) {
                  final int id = intOf(c['id']);
                  final String name = context.lang == 'fil' ? str(c['name_fil']) : str(c['name_en']);
                  return _chip(name, _categoryId == id, () => setState(() {
                        _categoryId = _categoryId == id ? null : id;
                        _shelfOnly = false;
                      }));
                }),
              ],
            ),
          ),
          Expanded(
            child: AsyncView<List<Map<String, dynamic>>>(
              refreshKey: '${app.version}|$_text|$_categoryId|$_shelfOnly',
              loader: _load,
              builder: (BuildContext ctx, List<Map<String, dynamic>> items, Future<void> Function() reload) {
                if (items.isEmpty) {
                  return ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: <Widget>[
                      const SizedBox(height: 60),
                      EmptyState(message: ctx.t('Nothing found. Try another word, or post it on the Wanted board.')),
                    ],
                  );
                }
                final List<Map<String, dynamic>> all = <Map<String, dynamic>>[...items, ..._more];
                return ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 90),
                  children: <Widget>[
                    ...all.map((Map<String, dynamic> it) => ItemCard(item: it, onTap: () => openItem(ctx, intOf(it['id'])))),
                    if (_hasMore)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: SoftButton(
                          label: _loadingMore ? ctx.t('Loading...') : ctx.t('Load more'),
                          icon: Icons.expand_more,
                          onPressed: _loadingMore ? null : () => _loadMore(all.length),
                        ),
                      ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _chip(String label, bool selected, VoidCallback onTap) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
      child: ChoiceChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) => onTap(),
        selectedColor: HiColors.primary,
        backgroundColor: Colors.white,
        labelStyle: const TextStyle(color: HiColors.ink, fontWeight: FontWeight.w700),
        side: const BorderSide(color: HiColors.line),
        showCheckmark: false,
      ),
    );
  }
}
