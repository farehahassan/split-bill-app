import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../balances/presentation/pages/balances_page.dart';
import '../../groups/presentation/pages/groups_page.dart';
import '../../home/presentation/pages/home_page.dart';
import '../../profile/presentation/pages/profile_page.dart';
import 'widgets/hisab_bottom_nav.dart';

/// The authenticated shell: Home / Groups / Activity / Profile tabs with the
/// center Add button pushing the receipt flow. Tabs cross-fade and slide.
class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _index = 0;

  void _select(int index) {
    if (_index == index) return;
    setState(() => _index = index);
  }

  /// Maps nav indices (0,1,3,4) to content pages (0,1,2,3); index 2 is the
  /// center Add button which pushes the receipt flow instead.
  int _contentIndex(int navIndex) => navIndex > 2 ? navIndex - 1 : navIndex;

  late final List<Widget> _pages = [
    HomePage(onOpenGroups: () => _select(1), onOpenActivity: () => _select(3)),
    const GroupsPage(),
    const BalancesPage(),
    const ProfilePage(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 360),
        switchInCurve: Curves.easeOutCubic,
        switchOutCurve: Curves.easeInCubic,
        transitionBuilder: (child, animation) {
          final curved = CurvedAnimation(
            parent: animation,
            curve: Curves.easeOutCubic,
          );
          return FadeTransition(
            opacity: curved,
            child: SlideTransition(
              position: Tween<Offset>(
                begin: const Offset(0.04, 0),
                end: Offset.zero,
              ).animate(curved),
              child: child,
            ),
          );
        },
        child: KeyedSubtree(
          key: ValueKey<int>(_index),
          child: _pages[_contentIndex(_index)],
        ),
      ),
      bottomNavigationBar: HisabBottomNav(
        currentIndex: _index,
        onTap: _select,
        onAdd: () => context.push('/receipt'),
      ),
    );
  }
}
