import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/i18n.dart';
import '../core/state.dart';
import '../core/theme.dart';
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
    // A red dot on Home (where the bell is) whenever there are unread notifications.
    Widget homeIcon(IconData icon) => Badge(
          isLabelVisible: app.unread > 0,
          label: Text('${app.unread}'),
          backgroundColor: HiColors.danger,
          child: Icon(icon),
        );
    final List<Widget> pages = <Widget>[
      HomeTab(onGoTo: _go),
      const DropoffsScreen(),
      const HubsScreen(),
      const ProfileScreen(),
    ];
    return Scaffold(
      body: SafeArea(child: IndexedStack(index: _index, children: pages)),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: _go,
        backgroundColor: Colors.white,
        indicatorColor: HiColors.primarySoft,
        destinations: <NavigationDestination>[
          NavigationDestination(icon: homeIcon(Icons.home_outlined), selectedIcon: homeIcon(Icons.home), label: context.t('Home')),
          NavigationDestination(icon: const Icon(Icons.inventory_2_outlined), selectedIcon: const Icon(Icons.inventory_2), label: context.t('Drop-offs')),
          NavigationDestination(icon: const Icon(Icons.place_outlined), selectedIcon: const Icon(Icons.place), label: context.t('Hubs')),
          NavigationDestination(icon: const Icon(Icons.person_outline), selectedIcon: const Icon(Icons.person), label: context.t('Me')),
        ],
      ),
    );
  }
}
