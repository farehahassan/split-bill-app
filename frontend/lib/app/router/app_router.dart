import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../features/activity/presentation/pages/activity_page.dart';
import '../../features/auth/presentation/pages/sign_in_page.dart';
import '../../features/receipt/presentation/pages/receipt_page.dart';
import '../../features/shell/presentation/main_shell.dart';
import '../../features/splash/presentation/pages/splash_page.dart';

/// Central route table. Every route uses a soft fade + slide-up transition
/// for a premium feel; navigation decisions stay in the router layer.
///
/// Built via [createAppRouter] so tests can create an isolated router per
/// test instead of sharing the singleton's navigation state.
final GoRouter appRouter = createAppRouter();

GoRouter createAppRouter() {
  return GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(
        path: '/',
        pageBuilder: (context, state) => _fadeSlidePage(const SplashPage()),
      ),
      GoRoute(
        path: '/sign-in',
        pageBuilder: (context, state) => _fadeSlidePage(const SignInPage()),
      ),
      GoRoute(
        path: '/shell',
        pageBuilder: (context, state) => _fadeSlidePage(const MainShell()),
      ),
      GoRoute(
        path: '/receipt',
        pageBuilder: (context, state) => _fadeSlidePage(const ReceiptPage()),
      ),
      GoRoute(
        path: '/transactions',
        pageBuilder: (context, state) =>
            _fadeSlidePage(const ActivityPage(showBack: true)),
      ),
    ],
  );
}

CustomTransitionPage<void> _fadeSlidePage(Widget child) {
  return CustomTransitionPage<void>(
    child: child,
    transitionDuration: const Duration(milliseconds: 420),
    reverseTransitionDuration: const Duration(milliseconds: 300),
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      final curved = CurvedAnimation(
        parent: animation,
        curve: Curves.easeOutCubic,
        reverseCurve: Curves.easeInCubic,
      );
      return FadeTransition(
        opacity: curved,
        child: SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(0, 0.04),
            end: Offset.zero,
          ).animate(curved),
          child: child,
        ),
      );
    },
  );
}
