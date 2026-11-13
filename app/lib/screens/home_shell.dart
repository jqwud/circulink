import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/i18n.dart';
import '../core/state.dart';
import '../widgets/common.dart';
import 'dropoffs_screen.dart';
import 'home_tab.dart';
import 'hubs_screen.dart';
import 'profile_screen.dart';

/// The main screen with the bottom bar: Home, Drop-offs, Hubs, Me.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> with WidgetsBindingObserver {
  int _index = 0;
  late final AppState _app = context.read<AppState>();

  void _go(int i) => setState(() => _index = i);

  // Live updates (AppState.liveCheck) run while this screen is up and the app is in front.
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _app.startLive();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _app.liveCheck();
      _app.startLive();
    } else if (state == AppLifecycleState.paused || state == AppLifecycleState.hidden) {
      _app.stopLive();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _app.stopLive();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final AppState app = context.watch<AppState>();
    final List<Widget> pages = <Widget>[
      HomeTab(onGoTo: _go),
      const DropoffsScreen(),
      const HubsScreen(),
      const ProfileScreen(),
    ];
    return Scaffold(
      body: SafeArea(child: IndexedStack(index: _index, children: pages)),
      bottomNavigationBar: PillNav(
        selected: _index,
        onSelect: _go,
        items: <PillNavItem>[
          // The unread count sits on Home, where the bell is.
          PillNavItem(icon: Icons.home_outlined, selectedIcon: Icons.home_rounded, label: context.t('Home'), badge: app.unread),
          PillNavItem(icon: Icons.inventory_2_outlined, selectedIcon: Icons.inventory_2_rounded, label: context.t('Drop-offs')),
          PillNavItem(icon: Icons.place_outlined, selectedIcon: Icons.place_rounded, label: context.t('Hubs')),
          PillNavItem(icon: Icons.person_outline_rounded, selectedIcon: Icons.person_rounded, label: context.t('Me')),
        ],
      ),
    );
  }
}
