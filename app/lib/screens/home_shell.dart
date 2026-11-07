import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/theme.dart';
import 'package:provider/provider.dart';

import '../core/state.dart';
import 'browse_screen.dart';
import 'home_tab.dart';
import 'profile_screen.dart';
import 'requests_screen.dart';
import 'simple_home.dart';
import 'wanted_screen.dart';

/// The main screen with the bottom bar: Home, Browse, Requests, Wanted, Me.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> with WidgetsBindingObserver {
  int _index = 0;
  late final AppState _app = context.read<AppState>();

  void _go(int i) => setState(() => _index = i);

  // Live updates (AppState.liveCheck) run while this screen is up and the app is in front: checked at once
  // when the resident comes back to the app, paused while it is in the background.
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
    if (app.simpleMode) return const SimpleHome();
    // A red dot on Home (where the bell is) whenever there are unread notifications, seen from any tab.
    Widget homeIcon(IconData icon) => Badge(
          isLabelVisible: app.unread > 0,
          label: Text('${app.unread}'),
          backgroundColor: HiColors.danger,
          child: Icon(icon),
        );
    final List<Widget> pages = <Widget>[
      HomeTab(onGoTo: _go),
      const BrowseScreen(),
      const RequestsScreen(),
      const WantedScreen(),
      const ProfileScreen(),
    ];
    return Scaffold(
      body: SafeArea(child: IndexedStack(index: _index, children: pages)),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: _go,
        backgroundColor: Colors.white,
        indicatorColor: HiColors.primary,
        destinations: <NavigationDestination>[
          NavigationDestination(icon: homeIcon(Icons.home_outlined), selectedIcon: homeIcon(Icons.home), label: context.t('Home')),
          NavigationDestination(icon: const Icon(Icons.search), selectedIcon: const Icon(Icons.search), label: context.t('Browse')),
          NavigationDestination(icon: const Icon(Icons.swap_horiz), selectedIcon: const Icon(Icons.swap_horiz), label: context.t('Requests')),
          NavigationDestination(icon: const Icon(Icons.campaign_outlined), selectedIcon: const Icon(Icons.campaign), label: context.t('Wanted')),
          NavigationDestination(icon: const Icon(Icons.person_outline), selectedIcon: const Icon(Icons.person), label: context.t('Me')),
        ],
      ),
    );
  }
}
