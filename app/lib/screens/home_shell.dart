import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/theme.dart';
import 'browse_screen.dart';
import 'home_tab.dart';
import 'profile_screen.dart';
import 'requests_screen.dart';
import 'wanted_screen.dart';

/// The main screen with the bottom bar: Home, Browse, Requests, Wanted, Me.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  void _go(int i) => setState(() => _index = i);

  @override
  Widget build(BuildContext context) {
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
          NavigationDestination(icon: const Icon(Icons.home_outlined), selectedIcon: const Icon(Icons.home), label: context.t('Home')),
          NavigationDestination(icon: const Icon(Icons.search), selectedIcon: const Icon(Icons.search), label: context.t('Browse')),
          NavigationDestination(icon: const Icon(Icons.swap_horiz), selectedIcon: const Icon(Icons.swap_horiz), label: context.t('Requests')),
          NavigationDestination(icon: const Icon(Icons.campaign_outlined), selectedIcon: const Icon(Icons.campaign), label: context.t('Wanted')),
          NavigationDestination(icon: const Icon(Icons.person_outline), selectedIcon: const Icon(Icons.person), label: context.t('Me')),
        ],
      ),
    );
  }
}
